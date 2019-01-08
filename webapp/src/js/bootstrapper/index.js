(function () {

  'use strict';

  var ONLINE_ROLE = 'mm-online';

  var translator = require('./translator');

  var purger = require('./purger');

  var getUserCtx = function() {
    var userCtx, locale;
    document.cookie.split(';').forEach(function(c) {
      c = c.trim().split('=', 2);
      if (c[0] === 'userCtx') {
        userCtx = c[1];
      }
      if (c[0] === 'locale') {
        locale = c[1];
      }
    });
    if (!userCtx) {
      return;
    }
    try {
      var parsedCtx = JSON.parse(unescape(decodeURI(userCtx)));
      parsedCtx.locale = locale;
      return parsedCtx;
    } catch (e) {
      return;
    }
  };

  var getDbInfo = function() {
    // parse the URL to determine the remote and local database names
    var url = window.location.href;
    var protocolLocation = url.indexOf('//') + 2;
    var hostLocation = url.indexOf('/', protocolLocation) + 1;
    var dbNameLocation = url.indexOf('/', hostLocation);
    var dbName = url.slice(hostLocation, dbNameLocation);
    return {
      name: dbName,
      remote: url.slice(0, dbNameLocation)
    };
  };

  var getLocalDbName = function(dbInfo, username) {
    return dbInfo.name + '-user-' + username;
  };

  var initialReplication = function(localDb, remoteDb) {
    setUiStatus('LOAD_APP');

    return remoteDb.info().then(info => {
      const highestSeq = parseInt(info.update_seq.split('-')[0]);
      const MAX_SAMPLES = 2; // cannot be less than two
      const dates = [];
      const seqs = [];
      let change = 0;

      var dbSyncStartTime = Date.now();
      var dbSyncStartData = getDataUsage();
      var replicator = localDb.replicate
        .from(remoteDb, {
          live: false,
          retry: false,
          heartbeat: 10000,
          timeout: 1000 * 60 * 10, // try for ten minutes then give up
        });

      replicator
        .on('change', function(info) {
          const seq = parseInt(info.last_seq.split('-')[0]);

          const idx = change++ % MAX_SAMPLES;

          dates[idx] = Date.now();
          seqs[idx] = seq;

          const samples = dates.length;
          const zero = (idx + 1) % samples;

          let dateDiff = 0;
          let seqDiff = 0;
          for (let delta = 0; delta < samples - 1; delta++) {
            const first = (zero + delta) % samples;
            const second = (zero + delta + 1) % samples;

            dateDiff += (dates[second] - dates[first]);
            seqDiff += (seqs[second] - seqs[first]);
          }
          dateDiff /= (samples - 1);
          seqDiff /= (samples - 1);

          const seqChunksLeft = (highestSeq - seq) / seqDiff;
          const timeLeft = dateDiff * seqChunksLeft;

          let minutes = Math.floor(timeLeft / 1000 / 60);

          if (minutes === 0) {
            minutes = '<1';
          }

          const percentLeft = Math.floor((seq / highestSeq) * 100);

          setUiStatus('FETCH_INFO', {
            percent: percentLeft,
            minutes: minutes || '?',
            total: info.docs_read || '?'
          });
        });

      return replicator
        .then(function() {
          var duration = Date.now() - dbSyncStartTime;
          console.info('Initial sync completed successfully in ' + (duration / 1000) + ' seconds');
          if (dbSyncStartData) {
            var dbSyncEndData = getDataUsage();
            var rx = dbSyncEndData.app.rx - dbSyncStartData.app.rx;
            console.info('Initial sync received ' + rx + 'B of data');
          }
        });
    });
  };

  var getDataUsage = function() {
    if (window.medicmobile_android && typeof window.medicmobile_android.getDataUsage === 'function') {
      return JSON.parse(window.medicmobile_android.getDataUsage());
    }
  };

  var redirectToLogin = function(dbInfo, err, callback) {
    console.warn('User must reauthenticate');
    var currentUrl = encodeURIComponent(window.location.href);
    err.redirect = '/' + dbInfo.name + '/login?redirect=' + currentUrl;
    return callback(err);
  };

  // TODO Use a shared library for this duplicated code #4021
  var hasRole = function(userCtx, role) {
    if (userCtx.roles) {
      for (var i = 0; i < userCtx.roles.length; i++) {
        if (userCtx.roles[i] === role) {
          return true;
        }
      }
    }
    return false;
  };

  var hasFullDataAccess = function(userCtx) {
    return hasRole(userCtx, '_admin') ||
           hasRole(userCtx, 'national_admin') || // kept for backwards compatibility
           hasRole(userCtx, ONLINE_ROLE);
  };

  var setUiStatus = function(translationKey, arg) {
    var translated = translator.translate(translationKey, arg);
    $('.bootstrap-layer .status').text(translated);
  };

  var setUiError = function() {
    var errorMessage = translator.translate('ERROR_MESSAGE');
    var tryAgain = translator.translate('TRY_AGAIN');
    $('.bootstrap-layer').html('<div><p>' + errorMessage + '</p><a id="btn-reload" class="btn btn-primary" href="#">' + tryAgain + '</a></div>');
    $('#btn-reload').click(() => window.location.reload(false));
  };

  var getDdoc = function(localDb) {
    return localDb.get('_design/medic-client');
  };

  module.exports = function(POUCHDB_OPTIONS, callback) {
    var dbInfo = getDbInfo();
    var userCtx = getUserCtx();
    if (!userCtx) {
      var err = new Error('User must reauthenticate');
      err.status = 401;
      return redirectToLogin(dbInfo, err, callback);
    }

    if (hasFullDataAccess(userCtx)) {
      return callback();
    }

    translator.setLocale(userCtx.locale);

    var username = userCtx.name;
    var localDbName = getLocalDbName(dbInfo, username);

    var localDb = window.PouchDB(localDbName, POUCHDB_OPTIONS.local);
    var remoteDb = window.PouchDB(dbInfo.remote, POUCHDB_OPTIONS.remote);

    let initialReplicationNeeded;

    getDdoc(localDb)
      .then(function() {
        // ddoc found - no need for initial replication
      })
      .catch(function() {
        // no ddoc found - do replication
        initialReplicationNeeded = true;
        return initialReplication(localDb, remoteDb)
          .then(function() {
            return getDdoc(localDb).catch(function() {
              throw new Error('Initial replication failed');
            });
          });
      })
      .then(() => {
        return purger(localDb, userCtx, initialReplicationNeeded)
          .on('start', () => setUiStatus('PURGE_INIT'))
          .on('progress', function(progress) {
            setUiStatus('PURGE_INFO', progress);
          })
          .on('optimise', () => setUiStatus('PURGE_AFTER'))
          .catch(console.error);
      }).then(function() {
        // replication complete
        setUiStatus('STARTING_APP');
      })
      .catch(function(err) {
        return err;
      })
      .then(function(err) {
        localDb.close();
        remoteDb.close();
        if (err) {
          if (err.status === 401) {
            return redirectToLogin(dbInfo, err, callback);
          }

          setUiError();
        }

        callback(err);
      });

  };
}());

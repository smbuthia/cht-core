const environment = require('./src/environment'),
  serverChecks = require('@medic/server-checks'),
  db = require('./src/db-pouch'),
  { promisify } = require('util'),
  fs = require('fs'),
  libxslt = require('libxslt'),
  logger = require('./src/logger');

process.on('unhandledRejection', reason => {
  logger.error('Unhandled Rejection:');
  logger.error('%o',reason);
});

const parse = file => {
  return new Promise((resolve, reject) => {
    fs.readFile(file, (err, xsl) => {
      if (err) {
        return reject(err);
      }
      libxslt.parse(xsl.toString('utf8'), (err, stylesheet) => {
        if (err) {
          return reject(err);
        }
        resolve(stylesheet);
      });
    });
  });
};

const apply = (stylesheet, xml) => {
  return new Promise((resolve, reject) => {
    stylesheet.apply(xml, function(err, result) {
      if (err) {
        return reject(err);
      }
      resolve(result);
    });
  });
};

// TODO shared lib??
const attach = (doc, name, content, type) => {
  if (!doc._attachments) {
    doc._attachments = {};
  }
  doc._attachments[name] = {
    data: Buffer.from(content, { type: type }),
    content_type: type
  };
};

const translateXsls = () => {
  return Promise.all([
    parse('node_modules/enketo-xslt/xsl/openrosa2html5form.xsl'),
    parse('node_modules/enketo-xslt/xsl/openrosa2xmlmodel.xsl'),
  ])
    .then(([ formStylesheet, modelStylesheet ]) => {
      return db.medic.get('form:delivery', { attachments: true, binary: true })
        .then(doc => {
          const xml = doc._attachments.xml.data.toString('utf8');
          return Promise.all([
            apply(formStylesheet, xml),
            apply(modelStylesheet, xml)
          ])
          .then(([ form, model ]) => {
            attach(doc, 'form', form, 'text/html');
            attach(doc, 'model', model, 'application/xml');
            return db.medic.put(doc);
          });
        });
    })
};

serverChecks.check(environment.serverUrl).then(() => {
  const app = require('./src/routing'),
    config = require('./src/config'),
    migrations = require('./src/migrations'),
    ddocExtraction = require('./src/ddoc-extraction'),
    translations = require('./src/translations'),
    serverUtils = require('./src/server-utils'),
    apiPort = process.env.API_PORT || 5988;

  Promise.resolve()
    .then(() => logger.info('Extracting ddoc…'))
    .then(ddocExtraction.run)
    .then(() => logger.info('DDoc extraction completed successfully'))

    .then(() => logger.info('Loading configuration…'))
    .then(config.load)
    .then(() => logger.info('Configuration loaded successfully'))
    .then(config.listen)

    .then(() => logger.info('Merging translations…'))
    .then(translations.run)
    .then(() => logger.info('Translations merged successfully'))

    .then(() => logger.info('Running db migrations…'))
    .then(migrations.run)
    .then(() => logger.info('Database migrations completed successfully'))

    .then(translateXsls)

    .catch(err => {
      logger.error('Fatal error initialising medic-api');
      logger.error('%o',err);
      process.exit(1);
    })

    .then(() => {
      // Define error-handling middleware last.
      // http://expressjs.com/guide/error-handling.html
      app.use((err, req, res, next) => {
        // jshint ignore:line
        if (res.headersSent) {
          // If we've already started a response (eg streaming), pass on to express to abort it
          // rather than attempt to resend headers for a 5xx response
          return next(err);
        }
        serverUtils.serverError(err, req, res);
      });
    })

    .then(() =>
      app.listen(apiPort, () => {
        logger.info('Medic API listening on port ' + apiPort);
      })
    );
});

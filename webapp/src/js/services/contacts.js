const _ = require('underscore');

angular.module('inboxServices').factory('Contacts',
  function(
    $q,
    Cache,
    ContactSchema,
    DB
  ) {

    'use strict';
    'ngInject';

    const cacheByType = {};

    ContactSchema.getPlaceTypes().forEach(function(type) {
      cacheByType[type] = Cache({
        get: function(callback) {
          DB().query('medic-client/contacts_by_type', { include_docs: true, key: [type] })
            .then(function(result) {
              callback(null, _.pluck(result.rows, 'doc'));
            })
            .catch(callback);
        },
        invalidate: function(change) {
          return change.doc && change.doc.type === type;
        }
      });
    });

    /**
     * Fetches all contacts for specified types (see ContactSchema.getPlaceTypes()).
     *
     * @param: types (array), eg: ['district_hospital', 'clinic']
     */
    return function(types) {
      if (!types || types.indexOf('person') !== -1) {
        // For admins this involves downloading a _huge_ amount of data.
        return $q.reject(new Error('Call made to Contacts requesting Person data'));
      }
      const relevantCaches = types.map(type => {
        const deferred = $q.defer();
        cacheByType[type]((err, result) => {
          if (err) {
            return deferred.reject(err);
          }
          deferred.resolve(result);
        });
        return deferred.promise;
      });
      return $q.all(relevantCaches).then(results => _.flatten(results));
    };
  }
);

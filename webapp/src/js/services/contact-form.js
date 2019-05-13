var _ = require('underscore');

angular.module('inboxServices').service('ContactForm',
  function(
    ContactSchema,
    EnketoTranslation,
    XmlForms
  ) {

    'use strict';
    'ngInject';

    const getAvailableFormIds = () => {
      return XmlForms.list().then(forms => forms.map(form => form._id));
    };

    var getFormById = function(availableForms, id) {
      if (_.contains(availableForms, id)) {
        return { id: id };
      }
    };

    var generateForm = function(type, extras) {
      var schema = ContactSchema.get(type);
      var xml = EnketoTranslation.generateXform(schema, extras);
      return { xml: xml };
    };

    var getFormFor = function(type, mode, extras) {
      return getAvailableFormIds().then(function(availableForms) {
        return getFormById(availableForms, 'form:contact:' + type + ':' + mode) ||
               getFormById(availableForms, 'form:contact:' + type) ||
               generateForm(type, extras);
      });
    };

    return {
      forCreate: function(type, extras) {
        return getFormFor(type, 'create', extras);
      },
      forEdit: function(type, extras) {
        return getFormFor(type, 'edit', extras);
      }
    };
  }
);

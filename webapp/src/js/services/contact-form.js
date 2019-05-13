angular.module('inboxServices').service('ContactForm',
  function(
    ContactSchema,
    EnketoTranslation,
    XmlForms
  ) {

    'use strict';
    'ngInject';

    var getFormById = function(availableForms, id) {
      const form = availableForms.find(form => form._id === id);
      if (form) {
        return { doc: form };
      }
    };

    var generateForm = function(type, extras) {
      var schema = ContactSchema.get(type);
      var xml = EnketoTranslation.generateXform(schema, extras);
      return { xml: xml };
    };

    var getFormFor = function(type, mode, extras) {
      return XmlForms.list().then(function(availableForms) {
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

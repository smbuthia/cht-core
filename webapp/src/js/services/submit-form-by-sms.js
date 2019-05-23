angular.module('inboxServices').service('SubmitFormBySms',
  function(
    $log,
    $q,
    $window,
    Form2Sms,
    Settings
  ) {
    'use strict';
    'ngInject';

    return doc => {
      let simulateSms = false;
      if(!$window.medicmobile_android) {
        $log.info('Not in android wrapper.');
        //return;
        simulateSms = true;
      }

      if(!simulateSms && !$window.medicmobile_android.sms_available) {
        $log.info('Android wrapper does not have SMS hooks.');
        //return;
        simulateSms = true;
      }

      if(!simulateSms && !$window.medicmobile_android.sms_available()) {
        $log.warn('Android wrapper does not have SMS enabled.  Check stacktrace to see why the SmsSender failed to initialise.');
        //return;
        simulateSms = true;
      }

      $q.resolve()
        .then(function() {
          return Form2Sms(doc)
            .then(function(smsContent) {

              if(!smsContent) {
                $log.debug('Form2Sms did not return any form content for doc:', doc);
                return;
              }

              Settings()
                .then(function(settings) {
                  var gatewayPhoneNumber = settings.gateway_number;
                  if(gatewayPhoneNumber) {
                    if (simulateSms) {
                      $log.info(`SMS sending simulator calling sms_send with parameters:\ndoc._id: ${doc._id}\ngateway phone nbr: ${gatewayPhoneNumber}\nsmsContent: "${smsContent}"`);
                    } else {
                      $window.medicmobile_android.sms_send(doc._id, gatewayPhoneNumber, smsContent);
                    }
                  } else {
                    $log.error('No gateway_number provided in app_settings.  Form cannot be submitted by SMS.');
                  }
                })
                .catch(function(err) {
                  $log.error('submitFormBySmsIfApplicable() failed: ' + err);
                });

            });
        });
    };
  }
);

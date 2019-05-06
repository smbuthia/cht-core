var _ = require('underscore'),
    moment = require('moment');

/**
 * Get the tasks, in order, for a given contact.
 * Pass in a listener to get a refreshed list after db changes.
 */
angular.module('inboxServices').factory('TasksForContact',
  function(
    $log,
    ContactTypes,
    RulesEngine
  ) {
    'use strict';
    'ngInject';

    var mergeTasks = function(existingTasks, newTasks) {
      $log.debug('Updating contact tasks', existingTasks, newTasks);
      if (existingTasks) {
        newTasks.forEach(function(task) {
          var toRemove = task.resolved || task.deleted;
          for (var i = 0; i < existingTasks.length; i++) {
            if (existingTasks[i]._id === task._id) {
              if (toRemove) {
                existingTasks.splice(i, 1);
              } else {
                existingTasks[i] = task;
              }
              return;
            }
          }
          if (!toRemove) {
            existingTasks.push(task);
          }
        });
      }
    };

    var sortTasks = function(tasks) {
      tasks.sort(function(a, b) {
        var dateA = new Date(a.date).getTime();
        var dateB = new Date(b.date).getTime();
        return dateA - dateB;
      });
    };

    var addLateStatus = function(tasks) {
      tasks.forEach(function(task) {
        var momentDate = moment(task.date);
        var now = moment().startOf('day');
        task.isLate = momentDate.isBefore(now);
      });
    };

    var getType = function(docType) {
      if (!RulesEngine.enabled) {
        return Promise.resolve();
      }
      // must be either a person type or a leaf place type
      return ContactTypes.getAll().then(types => {
        const type = types.find(type => docType === type.id);
        if (type.person) {
          return type;
        }
        const hasChild = types.some(type => !type.person && type.parents && type.parents.includes(docType));
        if (!hasChild) {
          return type;
        }
      });
    };

    var getIdsForTasks = function(docId, childrenPersonIds, contactType) {
      var contactIds = [docId];
      if (!contactType.person && childrenPersonIds && childrenPersonIds.length) {
        contactIds = contactIds.concat(childrenPersonIds);
      }
      return contactIds;
    };

    var getTasks = function(contactIds, listenerName, listener) {
      var taskList = [];
      RulesEngine.listen(listenerName, 'task', function(err, tasks) {
        if (err) {
          return $log.error('Error getting tasks', err);
        }
        var newTasks = _.filter(tasks, function(task) {
          return task.contact && _.contains(contactIds, task.contact._id);
        });
        addLateStatus(newTasks);
        mergeTasks(taskList, newTasks);
        sortTasks(taskList);
        listener(true, taskList);
      });
    };

    /** Listener format : function(areTasksEnabled, newTasks) */
    return function(docId, docType, childrenPersonIds, listenerName, listener) {
      return getType(docType).then(contactType => {
        if (!contactType) {
          return listener(false, []);
        }
        var contactIds = getIdsForTasks(docId, childrenPersonIds, contactType);
        getTasks(contactIds, listenerName, listener);
      });
    };

  }
);

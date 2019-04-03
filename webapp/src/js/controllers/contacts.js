var _ = require('underscore'),
  scrollLoader = require('../modules/scroll-loader');

(function() {
  'use strict';

  angular.module('inboxControllers').controller('ContactsCtrl', function(
    $log,
    $ngRedux,
    $q,
    $scope,
    $state,
    $stateParams,
    $translate,
    Actions,
    Auth,
    Changes,
    ContactSummary,
    ContactTypes,
    Export,
    GetDataRecords,
    LiveList,
    Search,
    SearchFilters,
    Selectors,
    Session,
    Settings,
    Simprints,
    Tour,
    TranslateFrom,
    UserSettings,
    XmlForms
  ) {
    'ngInject';

    var ctrl = this;
    var mapStateToTarget = function(state) {
      return {
        enketoEdited: Selectors.getEnketoEditedStatus(state),
        selected: Selectors.getSelected(state)
      };
    };
    var mapDispatchToTarget = function(dispatch) {
      var actions = Actions(dispatch);
      return {
        clearCancelCallback: actions.clearCancelCallback,
        setSelected: actions.setSelected,
        updateSelected: actions.updateSelected,
        loadSelectedChildren: actions.loadSelectedChildren,
        loadSelectedReports: actions.loadSelectedReports,
        setLoadingSelectedChildren: actions.setLoadingSelectedChildren,
        setLoadingSelectedReports: actions.setLoadingSelectedReports
      };
    };
    var unsubscribe = $ngRedux.connect(mapStateToTarget, mapDispatchToTarget)(ctrl);

    var liveList = LiveList.contacts;

    LiveList.$init($scope, 'contacts', 'contact-search');

    $scope.loading = true;
    ctrl.setSelected(null);
    $scope.filters = {};
    var defaultTypeFilter = {};
    var usersHomePlace;
    var additionalListItem = false;

    $scope.sortDirection = $scope.defaultSortDirection = 'alpha';
    var isSortedByLastVisited = function() {
      return $scope.sortDirection === 'last_visited_date';
    };

    var _initScroll = function() {
      scrollLoader.init(function() {
        if (!$scope.loading && $scope.moreItems) {
          _query({
            paginating: true,
            reuseExistingDom: true,
          });
        }
      });
    };

    var _query = function(options) {
      options = options || {};
      options.limit = options.limit || 50;

      if (!options.silent) {
        $scope.loading = true;
        $scope.error = false;
      }

      if (options.paginating) {
        $scope.appending = true;
        options.skip = liveList.count();
      } else if (!options.silent) {
        liveList.set([]);
        additionalListItem = false;
      }

      if (additionalListItem) {
        if (options.skip) {
          options.skip -= 1;
        } else {
          options.limit -= 1;
        }
      }

      var actualFilter = defaultTypeFilter;
      if ($scope.filters.search || $scope.filters.simprintsIdentities) {
        actualFilter = $scope.filters;
      }

      var extensions = {};
      if ($scope.lastVisitedDateExtras) {
        extensions.displayLastVisitedDate = true;
        extensions.visitCountSettings = $scope.visitCountSettings;
      }
      if (isSortedByLastVisited()) {
        extensions.sortByLastVisitedDate = true;
      }

      var docIds;
      if (options.withIds) {
        docIds = liveList.getList().map(function(item) {
          return item._id;
        });
      }

      console.log('SEARCHING', actualFilter, options, extensions, docIds);

      return Search('contacts', actualFilter, options, extensions, docIds)
        .then(function(contacts) {
          // If you have a home place make sure its at the top
          if (usersHomePlace) {
            var homeIndex = _.findIndex(contacts, function(contact) {
              return contact._id === usersHomePlace._id;
            });

            additionalListItem =
              !$scope.filters.search &&
              !$scope.filters.simprintsIdentities &&
              (additionalListItem || !$scope.appending) &&
              homeIndex === -1;

            if (!$scope.appending) {
              if (homeIndex !== -1) {
                // move it to the top
                contacts.splice(homeIndex, 1);
                contacts.unshift(usersHomePlace);
              } else if (
                !$scope.filters.search &&
                !$scope.filters.simprintsIdentities
              ) {
                contacts.unshift(usersHomePlace);
              }
              if ($scope.filters.simprintsIdentities) {
                contacts.forEach(function(contact) {
                  var identity = $scope.filters.simprintsIdentities.find(
                    function(identity) {
                      return identity.id === contact.simprints_id;
                    }
                  );
                  contact.simprints = identity || {
                    confidence: 0,
                    tierNumber: 5,
                  };
                });
              }
            }
          }

          $scope.moreItems = liveList.moreItems =
            contacts.length >= options.limit;

          const mergedList = options.paginating ?
            _.uniq(contacts.concat(liveList.getList()), false, _.property('_id'))
            : contacts;
          liveList.set(mergedList, !!options.reuseExistingDom);

          _initScroll();
          $scope.loading = false;
          $scope.appending = false;
          $scope.hasContacts = liveList.count() > 0;
          setActionBarData();
        })
        .catch(function(err) {
          $scope.error = true;
          $scope.loading = false;
          $scope.appending = false;
          $log.error('Error searching for contacts', err);
        });
    };

    const getChildTypes = function(typeId) {
      return ContactTypes.getChildren(typeId).then(childTypes => {
        const grouped = _.groupBy(childTypes, type => type.person ? 'persons' : 'places');
        const models = [];
        if (grouped.places) {
          models.push({
            menu_key: 'Add place',
            menu_icon: 'fa-building',
            permission: 'can_create_places',
            types: grouped.places
          });
        }
        if (grouped.persons) {
          models.push({
            menu_key: 'Add person',
            menu_icon: 'fa-user',
            permission: 'can_create_people',
            types: grouped.persons
          });
        }
        return models;
      });
    };

    // only admins can edit their own place
    var getCanEdit = function(selectedDoc) {
      if (Session.isAdmin()) {
        return true;
      }
      return setupPromise
        .then(() => usersHomePlace._id !== selectedDoc._id)
        .catch(() => false);
    };

    var translateTitle = function(key, label) {
      return key ? $translate.instant(key) : TranslateFrom(label);
    };

    var isUnmuteForm = function(settings, formId) {
      return Boolean(settings &&
                     formId &&
                     settings.muting &&
                     settings.muting.unmute_forms &&
                     settings.muting.unmute_forms.includes(formId));
    };

    const getTitle = selected => {
      const title = (selected.type && selected.type.name_key) ||
                    'contact.profile';
      return $translate(title).catch(() => title);
    };

    $scope.setSelected = function(selected, options) {
      liveList.setSelected(selected.doc._id);
      ctrl.setLoadingSelectedChildren(true);
      ctrl.setLoadingSelectedReports(true);
      ctrl.setSelected(selected);
      ctrl.clearCancelCallback();

      const selectedDoc = ctrl.selected.doc;
      $scope.loadingSummary = true;
      return $q
        .all([
          getTitle(selected),
          getCanEdit(selectedDoc),
          getChildTypes(selected.type.id)
        ])
        .then(function(results) {
          const title = results[0];
          const canEdit = results[1];
          const childTypes = results[2];
          $scope.setTitle(title);
          if (canEdit) {
            ctrl.updateSelected({ doc: { child: results[1] }});
          }

          $scope.setRightActionBar({
            relevantForms: [], // this disables the "New Action" button in action bar until full load is complete
            selected: [selectedDoc],
            sendTo: selected.type && selected.type.person ? selectedDoc : '',
            canDelete: false, // this disables the "Delete" button in action bar until full load is complete
            canEdit: canEdit,
            childTypes: childTypes
          });

          return ctrl.loadSelectedChildren(options)
            .then(ctrl.loadSelectedReports)
            .then(function() {
              return $q.all([
                ContactSummary(ctrl.selected.doc, ctrl.selected.reports, ctrl.selected.lineage),
                Settings()
              ])
              .then(function(results) {
                const summary = results[0];
                const settings = results[1];
                $scope.loadingSummary = false;
                ctrl.updateSelected({ summary: summary });
                var options = { doc: ctrl.selected.doc, contactSummary: summary.context };
                XmlForms('ContactsCtrl', options, function(err, forms) {
                  if (err) {
                    $log.error('Error fetching relevant forms', err);
                  }
                  var showUnmuteModal = function(formId) {
                    return ctrl.selected.doc &&
                          ctrl.selected.doc.muted &&
                          !isUnmuteForm(settings, formId);
                  };
                  var formSummaries =
                    forms &&
                    forms.map(function(xForm) {
                      return {
                        code: xForm.internalId,
                        title: translateTitle(xForm.translation_key, xForm.title),
                        icon: xForm.icon,
                        showUnmuteModal: showUnmuteModal(xForm.internalId)
                      };
                    });
                  var canDelete =
                    !ctrl.selected.children ||
                    ((!ctrl.selected.children.places ||
                      ctrl.selected.children.places.length === 0) &&
                      (!ctrl.selected.children.persons ||
                        ctrl.selected.children.persons.length === 0));
                  $scope.setRightActionBar({
                    selected: [selectedDoc],
                    relevantForms: formSummaries,
                    sendTo: selected.type && selected.type.person ? selectedDoc : '',
                    canEdit: canEdit,
                    canDelete: canDelete,
                    childTypes: childTypes
                  });
                });
                console.log('set relevantForms to ', formSummaries);
              });
            });
        })
        .catch(function(e) {
          $log.error('Error setting selected contact');
          $log.error(e);
          ctrl.updateSelected({ error: true });
          $scope.setRightActionBar();
        });
    };

    $scope.$on('ClearSelected', function() {
      clearSelection();
    });

    const clearSelection = () => {
      ctrl.setSelected(null);
      LiveList.contacts.clearSelected();
      LiveList['contact-search'].clearSelected();
    };

    $scope.search = function() {
      if($scope.filters.search && !ctrl.enketoEdited) {
        $state.go('contacts.detail', { id: null }, { notify: false });
        clearSelection();
      }

      $scope.loading = true;
      if ($scope.filters.search || $scope.filters.simprintsIdentities) {
        $scope.filtered = true;
        liveList = LiveList['contact-search'];
        liveList.set([]);
        return _query();
      } else {
        $scope.filtered = false;
        return _query();
      }
    };

    $scope.sort = function(sortDirection) {
      $scope.sortDirection = sortDirection;
      liveList.set([]);
      _query();
    };

    $scope.resetFilterModel = function() {
      $scope.filters = {};
      $scope.sortDirection = $scope.defaultSortDirection;
      SearchFilters.reset();
      $scope.search();
    };

    $scope.simprintsEnabled = Simprints.enabled();
    $scope.simprintsIdentify = function() {
      $scope.loading = true;
      Simprints.identify().then(function(identities) {
        $scope.filters.simprintsIdentities = identities;
        $scope.search();
      });
    };

    const getChildren = () => {
      let p;
      if (usersHomePlace) {
        // backwards compatibility with pre-flexible hierarchy users
        const homeType = usersHomePlace.contact_type || usersHomePlace.type;
        p = ContactTypes.getChildren(homeType);
      } else if (Session.isAdmin()) {
        p = ContactTypes.getChildren();
      } else {
        return Promise.resolve([]);
      }
      return p
        .then(children => {
          console.log('got children', children);
          return children;
        })
        .then(children => children.filter(child => !child.person))
        .then(places => {
          defaultTypeFilter = {
            types: {
              selected: places.map(place => place.id)
            }
          };
          return places;
        });
    };

    var setActionBarData = function() {
      getChildren().then(children => {
        console.log('setting children', children);
        $scope.setLeftActionBar({
          hasResults: $scope.hasContacts,
          userFacilityId: usersHomePlace && usersHomePlace._id,
          childPlaces: children,
          exportFn: function() {
            Export('contacts', $scope.filters, { humanReadable: true });
          },
        });
      });
    };

    var getUserHomePlaceSummary = function() {
      return UserSettings()
        .then(function(userSettings) {
          if (userSettings.facility_id) {
            return GetDataRecords(userSettings.facility_id);
          }
        })
        .then(function(summary) {
          if (summary) {
            summary.home = true;
          }
          return summary;
        });
    };

    var canViewLastVisitedDate = function() {
      if (Session.isDbAdmin()) {
        // disable UHC for DB admins
        return false;
      }
      return Auth('can_view_last_visited_date')
        .then(function() {
          return true;
        })
        .catch(function() {
          return false;
        });
    };

    var getVisitCountSettings = function(uhcSettings) {
      if (!uhcSettings.visit_count) {
        return {};
      }

      return {
        monthStartDate: uhcSettings.visit_count.month_start_date,
        visitCountGoal: uhcSettings.visit_count.visit_count_goal,
      };
    };

    var setupPromise = $q
      .all([getUserHomePlaceSummary(), canViewLastVisitedDate(), Settings()])
      .then(function(results) {
        usersHomePlace = results[0];
        $scope.lastVisitedDateExtras = results[1];
        var uhcSettings = (results[2] && results[2].uhc) || {};
        $scope.visitCountSettings = getVisitCountSettings(uhcSettings);
        if ($scope.lastVisitedDateExtras && uhcSettings.contacts_default_sort) {
          $scope.sortDirection = $scope.defaultSortDirection =
            uhcSettings.contacts_default_sort;
        }

        setActionBarData();
        return $scope.search();
      });

    this.getSetupPromiseForTesting = function(options) {
      if (options && options.scrollLoaderStub) {
        scrollLoader = options.scrollLoaderStub;
      }
      return setupPromise;
    };

    var isRelevantVisitReport = function(doc) {
      var isRelevantDelete = doc._deleted && isSortedByLastVisited();
      return (
        $scope.lastVisitedDateExtras &&
        doc.type === 'data_record' &&
        doc.form &&
        doc.fields &&
        doc.fields.visited_contact_uuid &&
        (liveList.contains({ _id: doc.fields.visited_contact_uuid }) ||
          isRelevantDelete)
      );
    };

    var changeListener = Changes({
      key: 'contacts-list',
      callback: function(change) {
        const limit = liveList.count();
        if (change.deleted && change.doc.type !== 'data_record') {
          liveList.remove(change.doc);
        }

        if (change.doc) {
          liveList.invalidateCache(change.doc._id);

          // Invalidate the contact for changing reports with visited_contact_uuid
          if (change.doc.fields) {
            liveList.invalidateCache(change.doc.fields.visited_contact_uuid);
          }
        }

        const withIds =
          isSortedByLastVisited() &&
          !!isRelevantVisitReport(change.doc) &&
          !change.deleted;
        return _query({
          limit,
          withIds,
          silent: true,
          reuseExistingDom: true,
        });
      },
      filter: function(change) {
        return (
          ContactTypes.includes(change.doc) ||
          liveList.containsDeleteStub(change.doc) ||
          isRelevantVisitReport(change.doc)
        );
      },
    });

    $scope.$on('$destroy', function () {
      unsubscribe();
      changeListener.unsubscribe();
      if (!$state.includes('contacts')) {
        LiveList.$reset('contacts', 'contact-search');
      }
    });

    if ($stateParams.tour) {
      Tour.start($stateParams.tour);
    }
  });
})();

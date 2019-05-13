describe('TasksContentCtrl', function() {
  let $scope,
      actions,
      getEnketoEditedStatus,
      task,
      watchCallback,
      createController,
      render,
      XmlForms;

  beforeEach(() => {
    module('inboxApp');
    KarmaUtils.setupMockStore();
  });

  beforeEach(inject(function($controller, $ngRedux, Actions, Selectors) {
    actions = Actions($ngRedux.dispatch);
    render = sinon.stub();
    XmlForms = { get: sinon.stub() };
    $scope = {
      $on: function() {},
      $watch: function(prop, cb) {
        watchCallback = cb;
      },
      setSelected: () => actions.setSelected(task)
    };
    getEnketoEditedStatus = () => Selectors.getEnketoEditedStatus($ngRedux.getState());
    render.returns(Promise.resolve());
    createController = function() {
      $controller('TasksContentCtrl', {
        $scope: $scope,
        $q: Q,
        Enketo: { render: render },
        DB: sinon.stub(),
        XmlForms: XmlForms,
        Telemetry: { record: sinon.stub() }
      });
    };
  }));

  afterEach(function() {
    KarmaUtils.restore(render, XmlForms);
  });

  it('loads form when task has one action and no fields', function(done) {
    task = {
      actions: [{
        type: 'report',
        form: 'A',
        content: 'nothing'
      }]
    };
    const form = { _id: 'myform', title: 'My Form' };
    XmlForms.get.resolves(form);
    createController();
    watchCallback();
    chai.expect($scope.formId).to.equal('A');
    setTimeout(function() {
      chai.expect(render.callCount).to.equal(1);
      chai.expect(render.getCall(0).args.length).to.equal(4);
      chai.expect(render.getCall(0).args[0]).to.equal('#task-report');
      chai.expect(render.getCall(0).args[1]).to.deep.equal(form);
      chai.expect(render.getCall(0).args[2]).to.equal('nothing');
      chai.expect(getEnketoEditedStatus()).to.equal(false);
      done();
    });
  });

  it('does not load form when task has more than one action', function(done) {
    task = {
      actions: [{}, {}] // two forms
    };
    createController();
    chai.expect($scope.formId).to.equal(null);
    chai.expect($scope.loadingForm).to.equal(undefined);
    chai.expect(render.callCount).to.equal(0);
    done();
  });

  it('does not load form when task has fields (e.g. description)', function(done) {
    task = {
      actions: [{
        type: 'report',
        form: 'B'
      }],
      fields: [{
        label: [{
          content: 'Description',
          locale: 'en'
        }],
        value: [{
          content: '{{contact.name}} survey due',
          locale: 'en'
        }]
      }]
    };
    createController();
    chai.expect($scope.formId).to.equal(null);
    chai.expect($scope.loadingForm).to.equal(undefined);
    chai.expect(render.callCount).to.equal(0);
    done();
  });

});

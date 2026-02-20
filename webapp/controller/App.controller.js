sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/mvc/XMLView",
  "sap/m/MessageToast",
  "sap/m/Page",
  "sap/m/Text"
], function (Controller, XMLView, MessageToast, Page, Text) {
  "use strict";

  var VIEW_MAP = {
    dashboard: "com.redigo.logistics.cockpit.view.Dashboard",
    workOrders: "com.redigo.logistics.cockpit.view.WorkOrders",
    workOrderDetail: "com.redigo.logistics.cockpit.view.WorkOrderDetail",
    inventory: "com.redigo.logistics.cockpit.view.Inventory",
    transactionLog: "com.redigo.logistics.cockpit.view.TransactionLog",
    dlq: "com.redigo.logistics.cockpit.view.DeadLetterQueue",
    reconciliation: "com.redigo.logistics.cockpit.view.Reconciliation",
    configuration: "com.redigo.logistics.cockpit.view.Configuration"
  };

  return Controller.extend("com.redigo.logistics.cockpit.controller.App", {

    onInit: function () {
      this._viewCache = {};
      this._showView("dashboard");
    },

    _showView: function (sKey) {
      var oSplitApp = this.byId("splitApp");
      var that = this;

      if (this._viewCache[sKey]) {
        oSplitApp.toDetail(this._viewCache[sKey].getId());
        return;
      }

      var sViewName = VIEW_MAP[sKey];
      if (!sViewName) { return; }

      var oComponent = this.getOwnerComponent();
      var oPromise = oComponent.runAsOwner(function () {
        return XMLView.create({ viewName: sViewName });
      });

      oPromise.then(function (oView) {
        that._viewCache[sKey] = oView;
        oSplitApp.addDetailPage(oView);
        oSplitApp.toDetail(oView.getId());
      }).catch(function (err) {
        var sMsg = err.message || String(err);
        console.error("View load FAILED: " + sViewName, err);
        var oBundle = that.getView().getModel("i18n").getResourceBundle();
        var sErrTitle = oBundle.getText("msgError") + ": " + sKey;
        var sErrText = oBundle.getText("msgViewLoadError", [sViewName, sMsg]);
        var oErrPage = new Page({
          title: sErrTitle,
          content: [
            new Text({ text: sErrText }).addStyleClass("sapUiSmallMargin")
          ]
        });
        that._viewCache[sKey] = oErrPage;
        oSplitApp.addDetailPage(oErrPage);
        oSplitApp.toDetail(oErrPage.getId());
      });
    },

    onNavSelect: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      if (!oItem) { return; }
      var sTarget = oItem.data("target");
      if (sTarget) {
        this._showView(sTarget);
      }
    }
  });
});

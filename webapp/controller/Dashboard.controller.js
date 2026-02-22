sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.Dashboard", {

    onInit: function () {
      var oDashModel = new JSONModel({
        totalOrders: 0, inProgress: 0, completedToday: 0, failedCount: 0,
        todayIngest: 0, pendingSAP: 0, dlqCount: 0, avgLatency: 0, recentOrders: []
      });
      this.getView().setModel(oDashModel, "dashboard");
      this._loadDashboardData();
    },

    _getText: function (sKey, aArgs) {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      return oBundle.getText(sKey, aArgs);
    },

    _loadDashboardData: function () {
      var oModel = this.getView().getModel("dashboard");
      API.get("/api/dashboard/kpis").then(function (data) {
        oModel.setProperty("/totalOrders", data.totalOrders || 0);
        oModel.setProperty("/inProgress", data.inProgress || 0);
        oModel.setProperty("/completedToday", data.completedToday || 0);
        oModel.setProperty("/failedCount", data.failedCount || 0);
        oModel.setProperty("/todayIngest", data.todayIngest || 0);
        oModel.setProperty("/pendingSAP", data.pendingSAP || 0);
        oModel.setProperty("/dlqCount", data.dlqCount || 0);
        oModel.setProperty("/avgLatency", data.avgLatency || 0);
      });
      API.get("/api/work-orders", { limit: 20 }).then(function (data) {
        var aRaw = data.data || [];
        var aOrders = aRaw.map(function (o) {
          o.received_at_formatted = o.received_at ? new Date(o.received_at).toLocaleString("tr-TR") : "-";
          return o;
        });
        oModel.setProperty("/recentOrders", aOrders);
      });
    },

    onRefreshDashboard: function () {
      this._loadDashboardData();
      MessageToast.show(this._getText("msgRefreshed"));
    },

    onTilePress: function () { this.getOwnerComponent().showView("workOrders"); },
    onDLQTilePress: function () { this.getOwnerComponent().showView("dlq"); },
    onTxTilePress: function () { this.getOwnerComponent().showView("transactionLog"); },

    onOrderSelect: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      if (!oItem) { return; }
      var oCtx = oItem.getBindingContext("dashboard");
      if (oCtx) {
        var sId = oCtx.getProperty("id");
        this.getOwnerComponent().showView("workOrderDetail", { orderId: sId });
      }
    },

    onOrderPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("dashboard");
      if (oCtx) {
        var sId = oCtx.getProperty("id");
        this.getOwnerComponent().showView("workOrderDetail", { orderId: sId });
      }
    },

    onSearchOrders: function (oEvent) {
      var sQuery = oEvent.getParameter("newValue");
      var oBinding = this.byId("recentOrdersTable").getBinding("items");
      var aFilters = [];
      if (sQuery) {
        aFilters.push(new sap.ui.model.Filter({
          filters: [
            new sap.ui.model.Filter("sap_delivery_no", sap.ui.model.FilterOperator.Contains, sQuery),
            new sap.ui.model.Filter("warehouse_code", sap.ui.model.FilterOperator.Contains, sQuery)
          ],
          and: false
        }));
      }
      oBinding.filter(aFilters);
    }
  });
});

sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, Filter, FilterOperator, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.TransactionLog", {
    onInit: function () {
      this._oModel = new JSONModel({ data: [], count: 0, countText: "", actionOptions: [] });
      this.getView().setModel(this._oModel, "txLog");
      this._sSearchQuery = "";
      this._loadData();
    },

    _getText: function (sKey, aArgs) {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      return oBundle.getText(sKey, aArgs);
    },

    _loadData: function () {
      var that = this;
      API.get("/api/transactions", { limit: 200 }).then(function (result) {
        var aData = (result.data || []).map(function (tx) {
          tx.started_at_fmt = tx.started_at ? new Date(tx.started_at).toLocaleString("tr-TR") : "";
          return tx;
        });
        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/count", aData.length);
        that._oModel.setProperty("/countText", that._getText("txTransactionCount", [aData.length]));
        that._buildActionOptions(aData);
        that._applyFilters();
      });
    },

    _buildActionOptions: function (aData) {
      var oActions = {};
      aData.forEach(function (tx) {
        if (tx.action && !oActions[tx.action]) {
          oActions[tx.action] = true;
        }
      });
      var aOptions = [{ key: "ALL", text: this._getText("txAllActions") }];
      Object.keys(oActions).sort().forEach(function (sAction) {
        aOptions.push({ key: sAction, text: sAction });
      });
      this._oModel.setProperty("/actionOptions", aOptions);
    },

    _applyFilters: function () {
      var oTable = this.byId("txTable");
      if (!oTable) { return; }
      var oBinding = oTable.getBinding("items");
      if (!oBinding) { return; }

      var aFilters = [];

      // Action filter
      var oActionFilter = this.byId("actionFilter");
      if (oActionFilter) {
        var sAction = oActionFilter.getSelectedKey();
        if (sAction && sAction !== "ALL") {
          aFilters.push(new Filter("action", FilterOperator.EQ, sAction));
        }
      }

      // Direction filter
      var oDirectionFilter = this.byId("directionFilter");
      if (oDirectionFilter) {
        var sDirection = oDirectionFilter.getSelectedKey();
        if (sDirection && sDirection !== "ALL") {
          aFilters.push(new Filter("direction", FilterOperator.EQ, sDirection));
        }
      }

      // Status filter
      var oStatusFilter = this.byId("statusFilter");
      if (oStatusFilter) {
        var sStatus = oStatusFilter.getSelectedKey();
        if (sStatus && sStatus !== "ALL") {
          aFilters.push(new Filter("status", FilterOperator.EQ, sStatus));
        }
      }

      // Search filter (action or sap_function)
      if (this._sSearchQuery) {
        aFilters.push(new Filter({
          filters: [
            new Filter("action", FilterOperator.Contains, this._sSearchQuery),
            new Filter("sap_function", FilterOperator.Contains, this._sSearchQuery),
            new Filter("delivery_no", FilterOperator.Contains, this._sSearchQuery)
          ],
          and: false
        }));
      }

      oBinding.filter(aFilters.length > 0 ? new Filter({ filters: aFilters, and: true }) : []);

      var iFiltered = oBinding.getLength();
      this._oModel.setProperty("/countText", this._getText("txTransactionCount", [iFiltered]));
    },

    onRefresh: function () { this._loadData(); },
    onFilterChange: function () { this._applyFilters(); },

    onSearch: function (oEvent) {
      this._sSearchQuery = oEvent.getParameter("newValue") || "";
      this._applyFilters();
    },

    onTxPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("txLog");
      var sId = oCtx.getProperty("work_order_id");
      if (sId) { this.getOwnerComponent().showView("workOrderDetail"); }
    }
  });
});

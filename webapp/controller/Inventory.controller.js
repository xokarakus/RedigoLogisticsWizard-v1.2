sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.Inventory", {
    onInit: function () {
      this._oModel = new JSONModel({
        mappings: [], transactions: [], count: 0, countText: "",
        warehouseOptions: []
      });
      this.getView().setModel(this._oModel, "inv");
      this._sSearchQuery = "";
      this._loadData();
    },

    _getText: function (sKey, aArgs) {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      return oBundle.getText(sKey, aArgs);
    },

    _loadData: function () {
      var that = this;
      API.get("/api/inventory/mappings").then(function (result) {
        that._oModel.setProperty("/mappings", result.data || []);
      });

      API.get("/api/transactions", { action_like: "INV_", limit: 100 }).then(function (result) {
        var aData = (result.data || []).map(function (tx) {
          tx.created_at_fmt = tx.created_at ? new Date(tx.created_at).toLocaleString("tr-TR") : "";
          return tx;
        });
        that._oModel.setProperty("/transactions", aData);
        that._oModel.setProperty("/count", aData.length);
        that._oModel.setProperty("/countText", that._getText("invMovementCount", [aData.length]));
        that._applyFilters();
      });

      // Load warehouses for filter dropdown
      API.get("/api/config/warehouses").then(function (result) {
        var aWarehouses = result.data || [];
        var aOptions = [{ key: "ALL", text: that._getText("invAllWarehouses") }];
        aWarehouses.forEach(function (w) {
          aOptions.push({ key: w.code, text: w.code + " \u2013 " + w.name });
        });
        that._oModel.setProperty("/warehouseOptions", aOptions);
      });
    },

    _applyFilters: function () {
      var oTable = this.byId("invTxTable");
      if (!oTable) { return; }
      var oBinding = oTable.getBinding("items");
      if (!oBinding) { return; }

      var aFilters = [];

      // Warehouse filter
      var oWarehouseFilter = this.byId("warehouseFilter");
      if (oWarehouseFilter) {
        var sWarehouse = oWarehouseFilter.getSelectedKey();
        if (sWarehouse && sWarehouse !== "ALL") {
          aFilters.push(new Filter("warehouse_code", FilterOperator.EQ, sWarehouse));
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

      // Search filter (material or action)
      if (this._sSearchQuery) {
        aFilters.push(new Filter({
          filters: [
            new Filter("material", FilterOperator.Contains, this._sSearchQuery),
            new Filter("action", FilterOperator.Contains, this._sSearchQuery)
          ],
          and: false
        }));
      }

      oBinding.filter(aFilters.length > 0 ? new Filter({ filters: aFilters, and: true }) : []);

      var iFiltered = oBinding.getLength();
      this._oModel.setProperty("/countText", this._getText("invMovementCount", [iFiltered]));
    },

    onRefresh: function () {
      this._loadData();
      MessageToast.show(this._getText("msgRefreshed"));
    },

    onFilterChange: function () { this._applyFilters(); },

    onSearch: function (oEvent) {
      this._sSearchQuery = oEvent.getParameter("newValue") || "";
      this._applyFilters();
    }
  });
});

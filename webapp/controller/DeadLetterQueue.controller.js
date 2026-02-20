sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageBox",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, Filter, FilterOperator, MessageBox, MessageToast, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.DeadLetterQueue", {
    onInit: function () {
      this._oModel = new JSONModel({
        data: [], count: 0, countText: "", actionOptions: [],
        editVisible: false, selectedId: null, selectedOriginal: "", selectedEdited: ""
      });
      this.getView().setModel(this._oModel, "dlq");
      this._sSearchQuery = "";
      this._loadData();
    },

    _getText: function (sKey, aArgs) {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      return oBundle.getText(sKey, aArgs);
    },

    _loadData: function () {
      var that = this;
      API.get("/api/transactions", { status: "DEAD", limit: 100 }).then(function (result) {
        var aData = (result.data || []).map(function (tx) {
          tx.started_at_fmt = tx.started_at ? new Date(tx.started_at).toLocaleString("tr-TR") : "";
          return tx;
        });
        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/count", aData.length);
        that._oModel.setProperty("/countText", that._getText("dlqItemCount", [aData.length]));
        that._buildActionOptions(aData);
        that._applyFilters();
      });
    },

    _buildActionOptions: function (aData) {
      var oActions = {};
      aData.forEach(function (tx) {
        if (tx.action && !oActions[tx.action]) { oActions[tx.action] = true; }
      });
      var aOptions = [{ key: "ALL", text: this._getText("dlqAllActions") }];
      Object.keys(oActions).sort().forEach(function (sAction) {
        aOptions.push({ key: sAction, text: sAction });
      });
      this._oModel.setProperty("/actionOptions", aOptions);
    },

    _applyFilters: function () {
      var oTable = this.byId("dlqTable");
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

      // Search filter (action, delivery_no, error_message)
      if (this._sSearchQuery) {
        aFilters.push(new Filter({
          filters: [
            new Filter("action", FilterOperator.Contains, this._sSearchQuery),
            new Filter("delivery_no", FilterOperator.Contains, this._sSearchQuery),
            new Filter("error_message", FilterOperator.Contains, this._sSearchQuery)
          ],
          and: false
        }));
      }

      oBinding.filter(aFilters.length > 0 ? new Filter({ filters: aFilters, and: true }) : []);

      var iFiltered = oBinding.getLength();
      this._oModel.setProperty("/countText", this._getText("dlqItemCount", [iFiltered]));
    },

    onRefresh: function () { this._loadData(); },
    onFilterChange: function () { this._applyFilters(); },

    onSearch: function (oEvent) {
      this._sSearchQuery = oEvent.getParameter("newValue") || "";
      this._applyFilters();
    },

    onItemSelect: function () { },

    onEditPayload: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("dlq");
      var oItem = oCtx.getObject();
      this._oModel.setProperty("/selectedId", oItem.id);
      this._oModel.setProperty("/selectedOriginal", JSON.stringify(oItem.sap_request, null, 2));
      this._oModel.setProperty("/selectedEdited", JSON.stringify(oItem.edited_payload || oItem.sap_request, null, 2));
      this._oModel.setProperty("/editVisible", true);
    },

    onCancelEdit: function () { this._oModel.setProperty("/editVisible", false); },

    onSaveAndReplay: function () {
      var sEdited = this._oModel.getProperty("/selectedEdited");
      try { JSON.parse(sEdited); } catch (e) { MessageBox.error(this._getText("msgInvalidJSON")); return; }
      MessageToast.show(this._getText("msgReplayTriggered"));
      this._oModel.setProperty("/editVisible", false);
    },

    onReplay: function () {
      var that = this;
      MessageBox.confirm(this._getText("msgConfirmReplay"), {
        onClose: function (sAction) { if (sAction === MessageBox.Action.OK) { MessageToast.show(that._getText("msgReplayTriggered")); } }
      });
    },

    onDiscard: function () {
      var that = this;
      MessageBox.warning(this._getText("msgConfirmDiscard"), {
        actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
        onClose: function (sAction) { if (sAction === MessageBox.Action.DELETE) { MessageToast.show(that._getText("msgDiscarded")); } }
      });
    }
  });
});

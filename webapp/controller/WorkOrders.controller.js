sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.WorkOrders", {
    onInit: function () {
      this._oModel = new JSONModel({
        data: [],
        count: 0,
        countText: "",
        warehouseOptions: [],
        deliveryTypeOptions: []
      });
      this.getView().setModel(this._oModel, "workOrders");
      this._sSearchQuery = "";
      this._loadData();
    },

    _getText: function (sKey, aArgs) {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      return oBundle.getText(sKey, aArgs);
    },

    _loadData: function () {
      var that = this;
      API.get("/api/work-orders", { limit: 200 }).then(function (result) {
        var aData = (result.data || []).map(function (o) {
          o.received_at_fmt = o.received_at ? new Date(o.received_at).toLocaleString("tr-TR") : "";
          o.completed_at_fmt = o.completed_at ? new Date(o.completed_at).toLocaleString("tr-TR") : "";
          o.line_count = (o.lines || []).length;
          return o;
        });
        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/count", aData.length);
        that._oModel.setProperty("/countText", that._getText("woOrderCount", [aData.length]));
        that._buildDeliveryTypeOptions(aData);
        that._applyFilters();
      });

      // Load warehouses for filter dropdown
      API.get("/api/config/warehouses").then(function (result) {
        var aWarehouses = result.data || [];
        var aOptions = [{ key: "ALL", text: that._getText("woAllWarehouses") }];
        aWarehouses.forEach(function (w) {
          aOptions.push({ key: w.code, text: w.code + " \u2013 " + w.name });
        });
        that._oModel.setProperty("/warehouseOptions", aOptions);
      });
    },

    _buildDeliveryTypeOptions: function (aData) {
      var oTypes = {};
      aData.forEach(function (o) {
        if (o.sap_delivery_type && !oTypes[o.sap_delivery_type]) {
          oTypes[o.sap_delivery_type] = true;
        }
      });
      var aOptions = [{ key: "ALL", text: this._getText("woAllDeliveryTypes") }];
      Object.keys(oTypes).sort().forEach(function (sType) {
        aOptions.push({ key: sType, text: sType });
      });
      this._oModel.setProperty("/deliveryTypeOptions", aOptions);
    },

    _applyFilters: function () {
      var oTable = this.byId("workOrdersTable");
      if (!oTable) { return; }
      var oBinding = oTable.getBinding("items");
      if (!oBinding) { return; }

      var aFilters = [];

      // Type filter (SegmentedButton)
      var oTypeFilter = this.byId("typeFilter");
      if (oTypeFilter) {
        var sType = oTypeFilter.getSelectedKey();
        if (sType && sType !== "ALL") {
          aFilters.push(new Filter("order_type", FilterOperator.EQ, sType));
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

      // Warehouse filter
      var oWarehouseFilter = this.byId("warehouseFilter");
      if (oWarehouseFilter) {
        var sWarehouse = oWarehouseFilter.getSelectedKey();
        if (sWarehouse && sWarehouse !== "ALL") {
          aFilters.push(new Filter("warehouse_code", FilterOperator.EQ, sWarehouse));
        }
      }

      // Delivery type filter
      var oDeliveryTypeFilter = this.byId("deliveryTypeFilter");
      if (oDeliveryTypeFilter) {
        var sDeliveryType = oDeliveryTypeFilter.getSelectedKey();
        if (sDeliveryType && sDeliveryType !== "ALL") {
          aFilters.push(new Filter("sap_delivery_type", FilterOperator.EQ, sDeliveryType));
        }
      }

      // Search filter
      if (this._sSearchQuery) {
        aFilters.push(new Filter("sap_delivery_no", FilterOperator.Contains, this._sSearchQuery));
      }

      // Apply combined AND filter
      oBinding.filter(aFilters.length > 0 ? new Filter({ filters: aFilters, and: true }) : []);

      // Update count text
      var iFiltered = oBinding.getLength();
      this._oModel.setProperty("/countText", this._getText("woOrderCount", [iFiltered]));
    },

    onTypeFilterChange: function () { this._applyFilters(); },
    onFilterChange: function () { this._applyFilters(); },

    onSearch: function (oEvent) {
      this._sSearchQuery = oEvent.getParameter("newValue") || "";
      this._applyFilters();
    },

    onRefresh: function () {
      this._loadData();
      MessageToast.show(this._getText("msgRefreshed"));
    },

    onSelectionChange: function () { },

    onRowPress: function () {
      this.getOwnerComponent().showView("workOrderDetail");
    },

    onExport: function () {
      MessageToast.show(this._getText("msgExportComingSoon"));
    },

    onProcessSelected: function () {
      var oTable = this.byId("workOrdersTable");
      var aSelectedItems = oTable.getSelectedItems();

      if (aSelectedItems.length === 0) {
        MessageToast.show(this._getText("msgProcessNoSelection"));
        return;
      }

      var aOrders = [];
      aSelectedItems.forEach(function (oItem) {
        var oCtx = oItem.getBindingContext("workOrders");
        if (oCtx) { aOrders.push(oCtx.getObject()); }
      });

      var sOrderList = aOrders.map(function (o) {
        return o.sap_delivery_no + " (" + o.sap_delivery_type + " / " + o.order_type + ")";
      }).join("\n");

      var that = this;
      MessageBox.confirm(
        this._getText("msgProcessConfirm", [aOrders.length, sOrderList]), {
        title: this._getText("msgProcessConfirmTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            that._processOrders(aOrders);
          }
        }
      });
    },

    _processOrders: function (aOrders) {
      var that = this;
      var iTotal = aOrders.length;
      var iDone = 0;

      function processNext() {
        if (iDone >= iTotal) {
          MessageToast.show(that._getText("msgProcessComplete"));
          that._loadData();
          return;
        }

        var oOrder = aOrders[iDone];
        var sPlant = oOrder.plant_code || "1000";
        var sWarehouse = oOrder.warehouse_code;
        var sDeliveryType = oOrder.sap_delivery_type;

        API.get("/api/config/process-steps", {
          plant_code: sPlant,
          warehouse_code: sWarehouse,
          delivery_type: sDeliveryType
        }).then(function (result) {
          if (result && result.steps && result.steps.length > 0) {
            that._runOrderSteps(oOrder, result.steps, 0, function () {
              iDone++;
              processNext();
            });
          } else {
            iDone++;
            processNext();
          }
        }).catch(function () {
          iDone++;
          processNext();
        });
      }

      processNext();
    },

    _runOrderSteps: function (oOrder, aSteps, iIndex, fnDone) {
      if (iIndex >= aSteps.length) {
        fnDone();
        return;
      }

      var that = this;
      var oStep = aSteps[iIndex];
      var oPayload = {
        delivery_no: oOrder.sap_delivery_no,
        plant_code: oOrder.plant_code || "1000",
        warehouse_code: oOrder.warehouse_code,
        delivery_type: oOrder.sap_delivery_type,
        mvt_type: oStep.mvt_type,
        step_no: oStep.step_no,
        step_name: oStep.name
      };

      API.post(oStep.api_endpoint, oPayload)
        .then(function () {
          that._runOrderSteps(oOrder, aSteps, iIndex + 1, fnDone);
        })
        .catch(function (err) {
          MessageBox.error(
            that._getText("msgProcessStepError", [oStep.name, err.message || ""])
          );
          fnDone();
        });
    }
  });
});

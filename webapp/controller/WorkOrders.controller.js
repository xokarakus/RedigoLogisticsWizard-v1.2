sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/ViewSettingsDialog",
  "sap/m/ViewSettingsItem",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, MessageToast, MessageBox,
             ViewSettingsDialog, ViewSettingsItem, API) {
  "use strict";

  /* Excel export column definitions */
  var EXPORT_COLS = [
    { label: "Teslimat No",     property: "sap_delivery_no",    type: "String" },
    { label: "Teslimat Tipi",   property: "sap_delivery_type",  type: "String" },
    { label: "Y\u00f6n",        property: "order_type",         type: "String" },
    { label: "S\u00fcre\u00e7", property: "process_type",       type: "String" },
    { label: "Durum",           property: "status",             type: "String" },
    { label: "SAP Tesis",       property: "plant_code",         type: "String" },
    { label: "Depo",            property: "warehouse_code",     type: "String" },
    { label: "Hareket Tipi",    property: "mvt_type",           type: "String" },
    { label: "M\u00fc\u015fteri Ad\u0131", property: "sap_ship_to",        type: "String" },
    { label: "Kalemler",        property: "line_count",         type: "Number" },
    { label: "\u00d6ncelik",    property: "priority",           type: "String" },
    { label: "Al\u0131nma",     property: "received_at_fmt",    type: "String" },
    { label: "Tamamlanma",      property: "completed_at_fmt",   type: "String" }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.WorkOrders", {
    onInit: function () {
      this._oModel = new JSONModel({
        data: [],
        count: 0,
        countText: "",
        warehouseOptions: [],
        deliveryTypeOptions: [],
        processTypeOptions: []
      });
      this.getView().setModel(this._oModel, "workOrders");
      this._sSearchQuery = "";
      this._loadData();
    },

    _getText: function (sKey, aArgs) {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      return oBundle.getText(sKey, aArgs);
    },

    /* ═══════════════════════════════════════════
       Data Loading
       ═══════════════════════════════════════════ */

    _loadData: function () {
      var that = this;
      API.get("/api/work-orders", { limit: 200 }).then(function (result) {
        var aData = (result.data || []).map(function (o) {
          o.received_at_fmt = o.received_at ? new Date(o.received_at).toLocaleString("tr-TR") : "";
          o.completed_at_fmt = o.completed_at ? new Date(o.completed_at).toLocaleString("tr-TR") : "";
          o.line_count = o.line_count || 0;
          return o;
        });
        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/count", aData.length);
        that._oModel.setProperty("/countText", that._getText("woOrderCount", [aData.length]));
        that._buildDeliveryTypeOptions(aData);
        that._buildProcessTypeOptions(aData);
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

    _buildProcessTypeOptions: function (aData) {
      var oTypes = {};
      aData.forEach(function (o) {
        if (o.process_type && !oTypes[o.process_type]) {
          oTypes[o.process_type] = o.process_type_desc || o.process_type;
        }
      });
      var aOptions = [{ key: "ALL", text: this._getText("woAllProcessTypes") }];
      Object.keys(oTypes).sort().forEach(function (sType) {
        aOptions.push({ key: sType, text: sType + " \u2013 " + oTypes[sType] });
      });
      this._oModel.setProperty("/processTypeOptions", aOptions);
    },

    /* ═══════════════════════════════════════════
       Filtering (sap.ui.table.Table uses "rows" binding)
       ═══════════════════════════════════════════ */

    _applyFilters: function () {
      var oTable = this.byId("workOrdersTable");
      if (!oTable) { return; }
      var oBinding = oTable.getBinding("rows");
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

      // Status filter (OPEN = acik is emirleri)
      var oStatusFilter = this.byId("statusFilter");
      if (oStatusFilter) {
        var sStatus = oStatusFilter.getSelectedKey();
        if (sStatus === "OPEN") {
          var aOpenStatuses = ["RECEIVED", "SENT_TO_WMS", "IN_PROGRESS", "PARTIALLY_DONE", "DISPATCH_FAILED"];
          var aStatusFilters = aOpenStatuses.map(function (s) {
            return new Filter("status", FilterOperator.EQ, s);
          });
          aFilters.push(new Filter({ filters: aStatusFilters, and: false }));
        } else if (sStatus && sStatus !== "ALL") {
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

      // Process type filter
      var oProcessTypeFilter = this.byId("processTypeFilter");
      if (oProcessTypeFilter) {
        var sProcessType = oProcessTypeFilter.getSelectedKey();
        if (sProcessType && sProcessType !== "ALL") {
          aFilters.push(new Filter("process_type", FilterOperator.EQ, sProcessType));
        }
      }

      // Date range filter (received_at)
      var oDateRange = this.byId("dateRangeFilter");
      if (oDateRange) {
        var dFrom = oDateRange.getDateValue();
        var dTo = oDateRange.getSecondDateValue();
        if (dFrom && dTo) {
          var dToEnd = new Date(dTo); dToEnd.setHours(23, 59, 59, 999);
          aFilters.push(new Filter({
            path: "received_at",
            test: function (val) {
              if (!val) return false;
              var d = new Date(val);
              return d >= dFrom && d <= dToEnd;
            }
          }));
        }
      }

      // Search filter (multi-field OR)
      if (this._sSearchQuery) {
        var sQ = this._sSearchQuery;
        aFilters.push(new Filter({
          filters: [
            new Filter("sap_delivery_no", FilterOperator.Contains, sQ),
            new Filter("warehouse_code", FilterOperator.Contains, sQ),
            new Filter("sap_ship_to", FilterOperator.Contains, sQ),
            new Filter("sap_customer_name", FilterOperator.Contains, sQ),
            new Filter("sap_city", FilterOperator.Contains, sQ),
            new Filter("process_type", FilterOperator.Contains, sQ),
            new Filter("process_type_desc", FilterOperator.Contains, sQ)
          ],
          and: false
        }));
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

    /* ═══════════════════════════════════════════
       Navigation (Grid Table uses cellClick + Link press)
       ═══════════════════════════════════════════ */

    onDeliveryPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("workOrders");
      if (oCtx) {
        var sId = oCtx.getProperty("id");
        this.getOwnerComponent().showView("workOrderDetail", { orderId: sId });
      }
    },

    onCellClick: function (oEvent) {
      var iColIdx = oEvent.getParameter("columnIndex");
      var oCtx = oEvent.getParameter("rowBindingContext");
      // Skip if clicking first column (Link handles it) or last column (action button)
      var oTable = this.byId("workOrdersTable");
      var iLastCol = oTable.getColumns().length - 1;
      if (!oCtx || iColIdx === 0 || iColIdx === iLastCol) { return; }
      var sId = oCtx.getProperty("id");
      this.getOwnerComponent().showView("workOrderDetail", { orderId: sId });
    },

    /* ═══════════════════════════════════════════
       Sort Dialog (ALV-style)
       ═══════════════════════════════════════════ */

    onSortDialog: function () {
      var that = this;
      if (!this._oSortDialog) {
        this._oSortDialog = new ViewSettingsDialog({
          confirm: function (oEvent) { that._onSortConfirm(oEvent); }
        });
        var aSortItems = [
          { key: "sap_delivery_no", text: this._getText("woDeliveryNo") },
          { key: "sap_delivery_type", text: this._getText("woDeliveryType") },
          { key: "order_type", text: this._getText("woType") },
          { key: "process_type", text: this._getText("woProcessType") },
          { key: "status", text: this._getText("woStatus") },
          { key: "plant_code", text: this._getText("woPlant") },
          { key: "warehouse_code", text: this._getText("woWarehouse") },
          { key: "mvt_type", text: this._getText("cfgMvtType") },
          { key: "sap_ship_to", text: this._getText("woShipTo") },
          { key: "priority", text: this._getText("woPriority") },
          { key: "received_at", text: this._getText("woReceivedAt") }
        ];
        aSortItems.forEach(function (o) {
          that._oSortDialog.addSortItem(new ViewSettingsItem({ key: o.key, text: o.text }));
        });
        this.getView().addDependent(this._oSortDialog);
      }
      this._oSortDialog.open();
    },

    _onSortConfirm: function (oEvent) {
      var oTable = this.byId("workOrdersTable");
      var oBinding = oTable.getBinding("rows");
      var sSortKey = oEvent.getParameter("sortItem").getKey();
      var bDesc = oEvent.getParameter("sortDescending");
      oBinding.sort(new Sorter(sSortKey, bDesc));
    },

    /* ═══════════════════════════════════════════
       Excel Export (ALV-style)
       ═══════════════════════════════════════════ */

    onExport: function () {
      var oTable = this.byId("workOrdersTable");
      var oBinding = oTable.getBinding("rows");
      if (!oBinding) { return; }

      sap.ui.require(["sap/ui/export/Spreadsheet"], function (Spreadsheet) {
        var oSettings = {
          workbook: { columns: EXPORT_COLS },
          dataSource: oBinding,
          fileName: "IsEmirleri_" + new Date().toISOString().slice(0, 10) + ".xlsx"
        };
        var oSheet = new Spreadsheet(oSettings);
        oSheet.build().finally(function () { oSheet.destroy(); });
      });
    },

    /* ═══════════════════════════════════════════
       Batch Processing (MultiToggle selection)
       ═══════════════════════════════════════════ */

    onProcessSelected: function () {
      var oTable = this.byId("workOrdersTable");
      var aIndices = oTable.getSelectedIndices();

      if (aIndices.length === 0) {
        MessageToast.show(this._getText("msgProcessNoSelection"));
        return;
      }

      var aOrders = [];
      aIndices.forEach(function (iIdx) {
        var oCtx = oTable.getContextByIndex(iIdx);
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

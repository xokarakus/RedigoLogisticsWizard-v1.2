sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, API) {
  "use strict";

  var PAGE_SIZE = 50;

  var EXPORT_COLS = [
    { label: "Teslimat No",       property: "sap_delivery_no",    type: "String" },
    { label: "Teslimat Tipi",     property: "sap_delivery_type",  type: "String" },
    { label: "Y\u00f6n",          property: "order_type",         type: "String" },
    { label: "S\u00fcre\u00e7",   property: "process_type",       type: "String" },
    { label: "Durum",             property: "status",             type: "String" },
    { label: "Tesis",             property: "plant_code",         type: "String" },
    { label: "Depo",              property: "warehouse_code",     type: "String" },
    { label: "Hareket Tipi",      property: "mvt_type",           type: "String" },
    { label: "M\u00fc\u015fteri", property: "sap_ship_to",        type: "String" },
    { label: "\u00d6ncelik",      property: "priority",           type: "String" },
    { label: "Kalemler",          property: "line_count",         type: "Number" },
    { label: "Al\u0131nma",       property: "received_at_fmt",    type: "String" },
    { label: "Tamamlanma",        property: "completed_at_fmt",   type: "String" },
    { label: "Ar\u015fivlenme",   property: "archived_at_fmt",    type: "String" },
    { label: "Notlar",            property: "notes",              type: "String" }
  ];

  return Controller.extend("com.redigo.logistics.cockpit.controller.Archive", {

    onInit: function () {
      this._oModel = new JSONModel({
        data: [],
        total: 0,
        limit: PAGE_SIZE,
        offset: 0,
        countText: "",
        pageText: "",
        warehouseOptions: [{ key: "ALL", text: "" }],
        deliveryTypeOptions: [{ key: "ALL", text: "" }],
        processTypeOptions: [{ key: "ALL", text: "" }]
      });
      this.getView().setModel(this._oModel, "archive");
      this._sSearchQuery = "";
      this._loadFilterOptions();
      this._loadData();
    },

    _getText: function (sKey, aArgs) {
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      return oBundle.getText(sKey, aArgs);
    },

    /* ═══ Filter Options ═══ */

    _loadFilterOptions: function () {
      var that = this;

      // Depolar
      API.get("/api/config/warehouses").then(function (result) {
        var aWarehouses = result.data || [];
        var aOptions = [{ key: "ALL", text: that._getText("woAllWarehouses") }];
        aWarehouses.forEach(function (w) {
          aOptions.push({ key: w.code, text: w.code + " \u2013 " + w.name });
        });
        that._oModel.setProperty("/warehouseOptions", aOptions);
      }).catch(function () {});

      // Teslimat tipleri ve surec tipleri veriden cekilecek
      API.get("/api/archive", { limit: 1 }).then(function () {
        // Teslimat tipleri
        var aDeliveryTypes = [{ key: "ALL", text: that._getText("woAllDeliveryTypes") }];
        ["LF", "NL", "EL", "RL", "UL"].forEach(function (t) {
          aDeliveryTypes.push({ key: t, text: t });
        });
        that._oModel.setProperty("/deliveryTypeOptions", aDeliveryTypes);

        // Surec tipleri
        var aProcessTypes = [{ key: "ALL", text: that._getText("woAllProcessTypes") }];
        ["GI", "GR", "RETURN", "TRANSFER", "SUBCONTRACT_GI", "SUBCONTRACT_GR"].forEach(function (t) {
          aProcessTypes.push({ key: t, text: t });
        });
        that._oModel.setProperty("/processTypeOptions", aProcessTypes);
      }).catch(function () {});
    },

    /* ═══ Data Loading ═══ */

    _buildParams: function () {
      var oParams = {
        limit: this._oModel.getProperty("/limit"),
        offset: this._oModel.getProperty("/offset")
      };

      // Metin arama
      if (this._sSearchQuery) {
        oParams.search = this._sSearchQuery;
      }

      // Durum
      var sStatus = this._getFilterValue("archiveStatusFilter");
      if (sStatus && sStatus !== "ALL") { oParams.status = sStatus; }

      // Yon
      var sType = this._getFilterValue("archiveTypeFilter");
      if (sType && sType !== "ALL") { oParams.order_type = sType; }

      // Teslimat tipi
      var sDeliveryType = this._getFilterValue("archiveDeliveryTypeFilter");
      if (sDeliveryType && sDeliveryType !== "ALL") { oParams.delivery_type = sDeliveryType; }

      // Depo
      var sWarehouse = this._getFilterValue("archiveWarehouseFilter");
      if (sWarehouse && sWarehouse !== "ALL") { oParams.warehouse_code = sWarehouse; }

      // Surec tipi
      var sProcess = this._getFilterValue("archiveProcessTypeFilter");
      if (sProcess && sProcess !== "ALL") { oParams.process_type = sProcess; }

      // Oncelik
      var sPriority = this._getFilterValue("archivePriorityFilter");
      if (sPriority && sPriority !== "ALL") { oParams.priority = sPriority; }

      // Arsivlenme tarihi
      var oArchiveDate = this.byId("archiveDateFilter");
      if (oArchiveDate) {
        var dFrom = oArchiveDate.getDateValue();
        var dTo = oArchiveDate.getSecondDateValue();
        if (dFrom && dTo) {
          oParams.archived_from = dFrom.toISOString().slice(0, 10);
          oParams.archived_to = dTo.toISOString().slice(0, 10);
        }
      }

      // Alinma tarihi
      var oReceivedDate = this.byId("archiveReceivedDateFilter");
      if (oReceivedDate) {
        var dRFrom = oReceivedDate.getDateValue();
        var dRTo = oReceivedDate.getSecondDateValue();
        if (dRFrom && dRTo) {
          oParams.received_from = dRFrom.toISOString().slice(0, 10);
          oParams.received_to = dRTo.toISOString().slice(0, 10);
        }
      }

      return oParams;
    },

    _getFilterValue: function (sId) {
      var oControl = this.byId(sId);
      return oControl ? oControl.getSelectedKey() : null;
    },

    _loadData: function () {
      var that = this;
      var oParams = this._buildParams();

      API.get("/api/archive", oParams).then(function (result) {
        var aData = result.data || [];
        var iTotal = result.total || 0;
        var iLimit = result.limit || PAGE_SIZE;
        var iOffset = result.offset || 0;

        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/total", iTotal);
        that._oModel.setProperty("/limit", iLimit);
        that._oModel.setProperty("/offset", iOffset);
        that._oModel.setProperty("/countText", that._getText("archiveCount", [iTotal]));

        // Sayfa bilgisi
        var iPage = Math.floor(iOffset / iLimit) + 1;
        var iTotalPages = Math.ceil(iTotal / iLimit) || 1;
        that._oModel.setProperty("/pageText", iPage + " / " + iTotalPages);
      }).catch(function () {
        MessageToast.show("Ar\u015fiv verileri y\u00fcklenemedi");
      });
    },

    /* ═══ Events ═══ */

    onSearch: function (oEvent) {
      this._sSearchQuery = oEvent.getParameter("query") || "";
      this._oModel.setProperty("/offset", 0);
      this._loadData();
    },

    onSearchLive: function (oEvent) {
      var sVal = oEvent.getParameter("newValue") || "";
      if (sVal.length === 0) {
        this._sSearchQuery = "";
        this._oModel.setProperty("/offset", 0);
        this._loadData();
      }
    },

    onFilterChange: function () {
      this._oModel.setProperty("/offset", 0);
      this._loadData();
    },

    onRefresh: function () {
      this._loadData();
      MessageToast.show(this._getText("msgRefreshed"));
    },

    onPrevPage: function () {
      var iOffset = this._oModel.getProperty("/offset");
      var iLimit = this._oModel.getProperty("/limit");
      this._oModel.setProperty("/offset", Math.max(0, iOffset - iLimit));
      this._loadData();
    },

    onNextPage: function () {
      var iOffset = this._oModel.getProperty("/offset");
      var iLimit = this._oModel.getProperty("/limit");
      var iTotal = this._oModel.getProperty("/total");
      if (iOffset + iLimit < iTotal) {
        this._oModel.setProperty("/offset", iOffset + iLimit);
        this._loadData();
      }
    },

    /* ═══ Navigation (read-only detay gorunumu) ═══ */

    onDeliveryPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("archive");
      if (oCtx) {
        var sId = oCtx.getProperty("id");
        this.getOwnerComponent().showView("workOrderDetail", { orderId: sId, source: "archive" });
      }
    },

    onCellClick: function (oEvent) {
      var iColIdx = oEvent.getParameter("columnIndex");
      var oCtx = oEvent.getParameter("rowBindingContext");
      if (!oCtx || iColIdx === 0) { return; }
      var sId = oCtx.getProperty("id");
      this.getOwnerComponent().showView("workOrderDetail", { orderId: sId, source: "archive" });
    },

    /* ═══ Excel Export ═══ */

    onExport: function () {
      var oTable = this.byId("archiveTable");
      var oBinding = oTable.getBinding("rows");
      if (!oBinding) { return; }

      sap.ui.require(["sap/ui/export/Spreadsheet"], function (Spreadsheet) {
        var oSettings = {
          workbook: { columns: EXPORT_COLS },
          dataSource: oBinding,
          fileName: "Arsiv_" + new Date().toISOString().slice(0, 10) + ".xlsx"
        };
        var oSheet = new Spreadsheet(oSettings);
        oSheet.build().finally(function () { oSheet.destroy(); });
      });
    }
  });
});

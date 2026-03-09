sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/ui/core/format/DateFormat",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, DateFormat, API) {
  "use strict";

  var PAGE_SIZE = 100;

  return Controller.extend("com.redigo.logistics.cockpit.controller.AuditLog", {

    onInit: function () {
      this._iOffset = 0;
      this._sSearch = "";
      this._oDateFormat = DateFormat.getDateInstance({ pattern: "yyyy-MM-dd" });
      this._oDisplayFormat = DateFormat.getDateTimeInstance({ pattern: "dd.MM.yyyy HH:mm:ss" });

      this._oModel = new JSONModel({
        data: [],
        total: 0,
        hasPrev: false,
        hasNext: false,
        pageInfo: "",
        countText: ""
      });
      this.getView().setModel(this._oModel, "audit");
      this._loadData();
    },

    _buildParams: function () {
      var oParams = {
        limit: PAGE_SIZE,
        offset: this._iOffset
      };

      if (this._sSearch) {
        oParams.search = this._sSearch;
      }

      var oSeveritySelect = this.byId("auditSeverityFilter");
      if (oSeveritySelect) {
        var sSeverity = oSeveritySelect.getSelectedKey();
        if (sSeverity) {
          oParams.severity = sSeverity;
        }
      }

      var oActionSelect = this.byId("auditActionFilter");
      if (oActionSelect) {
        var sAction = oActionSelect.getSelectedKey();
        if (sAction) {
          oParams.action = sAction;
        }
      }

      var oDateRange = this.byId("auditDateRange");
      if (oDateRange) {
        var oFrom = oDateRange.getDateValue();
        var oTo = oDateRange.getSecondDateValue();
        if (oFrom) {
          oParams.date_from = this._oDateFormat.format(oFrom);
        }
        if (oTo) {
          oParams.date_to = this._oDateFormat.format(oTo);
        }
      }

      return oParams;
    },

    _enrichData: function (aData) {
      var that = this;
      aData.forEach(function (row) {
        // Format date
        if (row.created_at) {
          try {
            row.created_at_fmt = that._oDisplayFormat.format(new Date(row.created_at));
          } catch (e) {
            row.created_at_fmt = row.created_at;
          }
        }
        // Stringify JSON fields
        row._oldValuesStr = row.old_values ? JSON.stringify(row.old_values) : "";
        row._newValuesStr = row.new_values ? JSON.stringify(row.new_values) : "";
      });
      return aData;
    },

    _loadData: function () {
      var that = this;
      var oParams = this._buildParams();

      API.get("/api/auth/audit-logs", oParams).then(function (res) {
        var aData = that._enrichData(res.data || []);
        var iTotal = res.total || aData.length;
        var iOffset = res.offset || that._iOffset;

        var iCurrentPage = Math.floor(iOffset / PAGE_SIZE) + 1;
        var iTotalPages = Math.max(1, Math.ceil(iTotal / PAGE_SIZE));

        that._oModel.setData({
          data: aData,
          total: iTotal,
          hasPrev: iOffset > 0,
          hasNext: (iOffset + PAGE_SIZE) < iTotal,
          pageInfo: iCurrentPage + " / " + iTotalPages,
          countText: iTotal + " kay\u0131t"
        });
      });
    },

    onRefresh: function () {
      this._iOffset = 0;
      this._loadData();
      MessageToast.show("Yenilendi");
    },

    onSearch: function (oEvent) {
      this._sSearch = (oEvent.getParameter("newValue") || "").trim();
      this._iOffset = 0;
      this._loadData();
    },

    onFilterChange: function () {
      this._iOffset = 0;
      this._loadData();
    },

    onPrevPage: function () {
      this._iOffset = Math.max(0, this._iOffset - PAGE_SIZE);
      this._loadData();
    },

    onNextPage: function () {
      this._iOffset += PAGE_SIZE;
      this._loadData();
    },

    onExport: function () {
      var aData = this._oModel.getProperty("/data") || [];
      if (!aData.length) {
        MessageToast.show("Disa aktarilacak veri yok");
        return;
      }

      var aHeaders = ["Zaman", "Kullanici", "Onem", "Islem", "Varlik", "Varlik ID", "Detay", "IP Adresi"];
      var aRows = aData.map(function (r) {
        return [
          r.created_at_fmt || "",
          r.username || "",
          r.severity || "",
          r.action || "",
          r.entity_type || "",
          r.entity_id || "",
          (r.detail || "").replace(/"/g, '""'),
          r.ip_address || ""
        ].map(function (v) { return '"' + v + '"'; }).join(";");
      });

      var sCsv = "\uFEFF" + aHeaders.join(";") + "\n" + aRows.join("\n");
      var oBlob = new Blob([sCsv], { type: "text/csv;charset=utf-8" });
      var sUrl = URL.createObjectURL(oBlob);
      var oLink = document.createElement("a");
      oLink.href = sUrl;
      oLink.download = "denetim_gunlugu_" + new Date().toISOString().slice(0, 10) + ".csv";
      oLink.click();
      URL.revokeObjectURL(sUrl);
    }
  });
});

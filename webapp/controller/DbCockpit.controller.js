sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Text",
  "sap/m/VBox",
  "sap/ui/table/Column",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Label, MText, VBox, UIColumn, API) {
  "use strict";

  var PAGE_SIZE = 50;

  return Controller.extend("com.redigo.logistics.cockpit.controller.DbCockpit", {

    onInit: function () {
      this._oModel = new JSONModel({
        tables: [],
        filteredTables: [],
        selectedTable: "",
        columns: [],
        constraints: [],
        data: [],
        fields: [],
        total: 0,
        offset: 0,
        hasPrev: false,
        hasNext: false,
        pageInfo: "",
        queryRowCount: "",
        relationships: [],
        allRelationships: []
      });
      this._oModel.setSizeLimit(5000);
      this.getView().setModel(this._oModel, "dbc");
      this._loadTables();
      this._loadRelationships();
    },

    _onBeforeShow: function () {
      this._loadTables();
    },

    /* ═══ Tablo Listesi ═══ */

    _loadTables: function () {
      var that = this;
      API.get("/api/db-cockpit/tables").then(function (res) {
        var data = res.data || [];
        that._oModel.setProperty("/tables", data);
        that._oModel.setProperty("/filteredTables", data);
      }).catch(function (err) {
        MessageBox.error(err.message || String(err));
      });
    },

    onTableSearch: function (oEvent) {
      var q = (oEvent.getParameter("newValue") || "").toLowerCase();
      var all = this._oModel.getProperty("/tables");
      var filtered = !q ? all : all.filter(function (t) {
        return t.name.toLowerCase().indexOf(q) >= 0;
      });
      this._oModel.setProperty("/filteredTables", filtered);
    },

    onTableSelect: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      if (!oItem) return;
      var sTable = oItem.getBindingContext("dbc").getObject().name;
      this._oModel.setProperty("/selectedTable", sTable);
      this._oModel.setProperty("/offset", 0);
      this._loadTableSchema(sTable);
      this._loadTableData(sTable);
      // Veri sekmesine gec
      var oTabs = this.byId("mainTabs");
      if (oTabs) oTabs.setSelectedKey("data");
    },

    /* ═══ Tablo Sema ═══ */

    _loadTableSchema: function (sTable) {
      var that = this;
      API.get("/api/db-cockpit/tables/" + sTable + "/schema").then(function (res) {
        that._oModel.setProperty("/columns", res.columns || []);
        that._oModel.setProperty("/constraints", res.constraints || []);
      });
    },

    onShowColumnInfo: function () {
      var sTable = this._oModel.getProperty("/selectedTable");
      if (!sTable) {
        MessageToast.show(this._i18n("dbCockpitNoTableSelected"));
        return;
      }

      var aCols = this._oModel.getProperty("/columns") || [];
      var aCons = this._oModel.getProperty("/constraints") || [];
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      // FK map
      var fkMap = {};
      aCons.filter(function (c) { return c.constraint_type === "FOREIGN KEY"; }).forEach(function (c) {
        fkMap[c.column_name] = c.ref_table + "." + c.ref_column;
      });

      // PK set
      var pkSet = {};
      aCons.filter(function (c) { return c.constraint_type === "PRIMARY KEY"; }).forEach(function (c) {
        pkSet[c.column_name] = true;
      });

      var aItems = aCols.map(function (col) {
        var sType = col.data_type;
        if (col.character_maximum_length) sType += "(" + col.character_maximum_length + ")";
        var sExtra = "";
        if (pkSet[col.column_name]) sExtra += " [PK]";
        if (fkMap[col.column_name]) sExtra += " FK\u2192" + fkMap[col.column_name];
        if (col.is_nullable === "NO") sExtra += " NOT NULL";

        return new sap.m.CustomListItem({
          content: [
            new sap.m.HBox({
              justifyContent: "SpaceBetween",
              width: "100%",
              items: [
                new MText({ text: col.column_name }).addStyleClass("sapUiSmallMarginEnd"),
                new MText({ text: sType + sExtra }).addStyleClass("sapThemeTextColor")
              ]
            })
          ]
        });
      });

      var oDialog = new Dialog({
        title: sTable + " \u2014 " + oBundle.getText("dbCockpitColumns"),
        contentWidth: "550px",
        content: [
          new sap.m.List({ items: aItems })
        ],
        endButton: new Button({
          text: oBundle.getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.open();
    },

    /* ═══ Tablo Verisi ═══ */

    _loadTableData: function (sTable) {
      var that = this;
      var offset = this._oModel.getProperty("/offset") || 0;
      var oDataTable = this.byId("dataTable");
      if (oDataTable) oDataTable.setBusy(true);

      API.get("/api/db-cockpit/tables/" + sTable + "/data", {
        limit: PAGE_SIZE,
        offset: offset
      }).then(function (res) {
        var data = res.data || [];
        var fields = res.fields || [];
        var total = res.total || 0;

        that._oModel.setProperty("/data", data);
        that._oModel.setProperty("/fields", fields);
        that._oModel.setProperty("/total", total);
        that._oModel.setProperty("/hasPrev", offset > 0);
        that._oModel.setProperty("/hasNext", offset + PAGE_SIZE < total);

        var pageStart = total > 0 ? offset + 1 : 0;
        var pageEnd = Math.min(offset + PAGE_SIZE, total);
        that._oModel.setProperty("/pageInfo", pageStart + "-" + pageEnd + " / " + total);

        that._buildDataColumns(fields);
        if (oDataTable) oDataTable.setBusy(false);
      }).catch(function (err) {
        if (oDataTable) oDataTable.setBusy(false);
        MessageBox.error(err.message || String(err));
      });
    },

    _buildDataColumns: function (aFields) {
      var oTable = this.byId("dataTable");
      if (!oTable) return;

      oTable.destroyColumns();
      oTable.unbindRows();

      aFields.forEach(function (field) {
        var sWidth = "150px";
        if (field === "id") sWidth = "280px";
        else if (field.endsWith("_at")) sWidth = "180px";

        oTable.addColumn(new UIColumn({
          label: new Label({ text: field }),
          template: new MText({
            text: "{dbc>" + field + "}",
            wrapping: false,
            maxLines: 1
          }),
          sortProperty: field,
          autoResizable: true,
          width: sWidth
        }));
      });

      oTable.bindRows("dbc>/data");
    },

    onRefreshData: function () {
      var sTable = this._oModel.getProperty("/selectedTable");
      if (sTable) {
        this._loadTableData(sTable);
      }
    },

    onPrevPage: function () {
      var offset = this._oModel.getProperty("/offset") || 0;
      this._oModel.setProperty("/offset", Math.max(0, offset - PAGE_SIZE));
      this._loadTableData(this._oModel.getProperty("/selectedTable"));
    },

    onNextPage: function () {
      var offset = this._oModel.getProperty("/offset") || 0;
      this._oModel.setProperty("/offset", offset + PAGE_SIZE);
      this._loadTableData(this._oModel.getProperty("/selectedTable"));
    },

    /* ═══ SQL Sorgusu ═══ */

    onExecuteQuery: function () {
      var oEditor = this.byId("sqlEditor");
      var sSql = (oEditor.getValue() || "").trim();
      if (!sSql) {
        MessageToast.show(this._i18n("dbCockpitSelectOnly"));
        return;
      }

      var that = this;
      var oStatus = this.byId("queryStatus");
      var oResultTable = this.byId("queryResultTable");
      if (oResultTable) oResultTable.setBusy(true);

      API.post("/api/db-cockpit/query", { sql: sSql }).then(function (res) {
        var data = res.data || [];
        var fields = res.fields || [];

        that._oModel.setProperty("/queryResult", data);
        that._oModel.setProperty("/queryFields", fields);
        that._oModel.setProperty("/queryRowCount", data.length + " sat\u0131r");

        if (oStatus) {
          oStatus.setText(that._i18n("dbCockpitExecTime", [res.executionTime || 0]));
          oStatus.setState("Success");
        }

        that._buildQueryColumns(fields);
        if (oResultTable) oResultTable.setBusy(false);
      }).catch(function (err) {
        if (oResultTable) oResultTable.setBusy(false);
        var sErr = err.message || String(err);
        if (oStatus) {
          oStatus.setText(sErr);
          oStatus.setState("Error");
        }
        MessageBox.error(sErr);
      });
    },

    _buildQueryColumns: function (aFields) {
      var oTable = this.byId("queryResultTable");
      if (!oTable) return;

      oTable.destroyColumns();
      oTable.unbindRows();

      aFields.forEach(function (field) {
        oTable.addColumn(new UIColumn({
          label: new Label({ text: field }),
          template: new MText({
            text: "{dbc>" + field + "}",
            wrapping: false,
            maxLines: 1
          }),
          autoResizable: true,
          width: "150px"
        }));
      });

      oTable.bindRows("dbc>/queryResult");
    },

    /* ═══ Iliskiler ═══ */

    _loadRelationships: function () {
      var that = this;
      API.get("/api/db-cockpit/relationships").then(function (res) {
        var data = res.data || [];
        that._oModel.setProperty("/relationships", data);
        that._oModel.setProperty("/allRelationships", data);
      });
    },

    onRelationshipSearch: function (oEvent) {
      var q = (oEvent.getParameter("newValue") || "").toLowerCase();
      var all = this._oModel.getProperty("/allRelationships");
      var filtered = !q ? all : all.filter(function (r) {
        return r.source_table.toLowerCase().indexOf(q) >= 0 ||
               r.target_table.toLowerCase().indexOf(q) >= 0 ||
               r.source_column.toLowerCase().indexOf(q) >= 0;
      });
      this._oModel.setProperty("/relationships", filtered);
    },

    onRefreshRelationships: function () {
      this._loadRelationships();
      MessageToast.show(this._i18n("msgRefreshed"));
    },

    /* ═══ Export ═══ */

    onExport: function () {
      this._exportCsv(
        this._oModel.getProperty("/fields"),
        this._oModel.getProperty("/data"),
        this._oModel.getProperty("/selectedTable")
      );
    },

    onExportQuery: function () {
      this._exportCsv(
        this._oModel.getProperty("/queryFields"),
        this._oModel.getProperty("/queryResult"),
        "query_result"
      );
    },

    _exportCsv: function (aFields, aData, sName) {
      if (!aFields || !aFields.length || !aData || !aData.length) {
        MessageToast.show("Veri yok");
        return;
      }

      var rows = [aFields.join(",")];
      aData.forEach(function (row) {
        var vals = aFields.map(function (f) {
          var v = row[f];
          if (v === null || v === undefined) return "";
          var s = typeof v === "object" ? JSON.stringify(v) : String(v);
          return '"' + s.replace(/"/g, '""') + '"';
        });
        rows.push(vals.join(","));
      });

      var blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = (sName || "export") + ".csv";
      a.click();
      URL.revokeObjectURL(url);
    },

    /* ═══ Helpers ═══ */

    _i18n: function (sKey, aArgs) {
      return this.getView().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
    }
  });
});

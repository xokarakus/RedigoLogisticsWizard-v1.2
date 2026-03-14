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
        allRelationships: [],
        savedQueries: []
      });
      this._oModel.setSizeLimit(5000);
      this.getView().setModel(this._oModel, "dbc");
      this._loadTables();
      this._loadRelationships();
      this._loadSavedQueriesRaw();
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
        var oCount = that.byId("tableCount");
        if (oCount) oCount.setText(data.length + " tablo");
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

    /* ═══ Iliskiler (Gorsel) ═══ */

    _loadRelationships: function () {
      var that = this;
      API.get("/api/db-cockpit/relationships").then(function (res) {
        var data = res.data || [];
        that._allRelationships = data;
        that._buildRelationshipPanels(data);
      });
    },

    _buildRelationshipPanels: function (aData) {
      var oContainer = this.byId("relContainer");
      if (!oContainer) return;
      oContainer.destroyItems();

      // Tablolara gore grupla: outgoing (source) ve incoming (target)
      var tableMap = {};
      aData.forEach(function (r) {
        // Outgoing: bu tablo baska tabloya referans veriyor
        if (!tableMap[r.source_table]) tableMap[r.source_table] = { outgoing: [], incoming: [] };
        tableMap[r.source_table].outgoing.push(r);
        // Incoming: bu tablo baska tablodan referans alıyor
        if (!tableMap[r.target_table]) tableMap[r.target_table] = { outgoing: [], incoming: [] };
        tableMap[r.target_table].incoming.push(r);
      });

      var aTableNames = Object.keys(tableMap).sort();
      var that = this;

      // Stats
      var oStats = this.byId("relStats");
      if (oStats) {
        oStats.setText(aTableNames.length + " tablo, " + aData.length + " FK");
        oStats.setState("Information");
      }

      if (aTableNames.length === 0) {
        oContainer.addItem(new sap.m.IllustratedMessage({
          illustrationType: "sapIllus-EmptyList",
          title: "İlişki bulunamadı"
        }));
        return;
      }

      aTableNames.forEach(function (tableName) {
        var info = tableMap[tableName];
        var totalRels = info.outgoing.length + info.incoming.length;

        var oPanel = new sap.m.Panel({
          headerToolbar: new sap.m.OverflowToolbar({
            content: [
              new sap.ui.core.Icon({ src: "sap-icon://database", color: "#0854A0" }).addStyleClass("sapUiSmallMarginEnd"),
              new sap.m.Link({
                text: tableName,
                press: function () { that._navigateToTable(tableName); }
              }).addStyleClass("sapUiSmallMarginEnd sapMTitle"),
              new sap.m.ObjectStatus({
                text: totalRels + " FK",
                state: "Information"
              }),
              new sap.m.ToolbarSpacer(),
              new sap.m.ObjectStatus({
                text: info.outgoing.length > 0 ? "\u2197 " + info.outgoing.length : "",
                state: "Warning",
                visible: info.outgoing.length > 0
              }),
              new sap.m.ObjectStatus({
                text: info.incoming.length > 0 ? "\u2199 " + info.incoming.length : "",
                state: "Success",
                visible: info.incoming.length > 0
              })
            ]
          }),
          expandable: true,
          expanded: false,
          width: "100%"
        }).addStyleClass("sapUiTinyMarginBottom");

        var oPanelContent = new sap.m.VBox();

        // Outgoing FK'lar (bu tablo -> baska tablo)
        if (info.outgoing.length > 0) {
          oPanelContent.addItem(
            new sap.m.Toolbar({
              content: [
                new sap.ui.core.Icon({ src: "sap-icon://arrow-top", color: "#E78C07" }).addStyleClass("sapUiTinyMarginEnd"),
                new MText({ text: "Referans Veriyor (" + info.outgoing.length + ")" }).addStyleClass("sapUiTinyMarginEnd sapThemeHighlightColor")
              ]
            }).addStyleClass("sapUiTinyMarginBottom")
          );

          info.outgoing.forEach(function (rel) {
            oPanelContent.addItem(new sap.m.HBox({
              alignItems: "Center",
              items: [
                new sap.m.ObjectStatus({ text: rel.source_column, state: "Warning" }).addStyleClass("sapUiSmallMarginBegin sapUiTinyMarginEnd"),
                new sap.ui.core.Icon({ src: "sap-icon://arrow-right", size: "0.875rem", color: "#888" }).addStyleClass("sapUiTinyMarginEnd"),
                new sap.m.Link({
                  text: rel.target_table,
                  press: function () { that._navigateToTable(rel.target_table); }
                }).addStyleClass("sapUiTinyMarginEnd"),
                new MText({ text: "." + rel.target_column }).addStyleClass("sapThemeTextColor")
              ]
            }).addStyleClass("sapUiTinyMarginBottom"));
          });
        }

        // Incoming FK'lar (baska tablo -> bu tablo)
        if (info.incoming.length > 0) {
          if (info.outgoing.length > 0) {
            oPanelContent.addItem(new sap.m.ToolbarSeparator().addStyleClass("sapUiSmallMarginTopBottom"));
          }
          oPanelContent.addItem(
            new sap.m.Toolbar({
              content: [
                new sap.ui.core.Icon({ src: "sap-icon://arrow-bottom", color: "#2B7C2B" }).addStyleClass("sapUiTinyMarginEnd"),
                new MText({ text: "Referans Alan (" + info.incoming.length + ")" }).addStyleClass("sapUiTinyMarginEnd sapThemeHighlightColor")
              ]
            }).addStyleClass("sapUiTinyMarginBottom")
          );

          info.incoming.forEach(function (rel) {
            oPanelContent.addItem(new sap.m.HBox({
              alignItems: "Center",
              items: [
                new sap.m.Link({
                  text: rel.source_table,
                  press: function () { that._navigateToTable(rel.source_table); }
                }).addStyleClass("sapUiSmallMarginBegin sapUiTinyMarginEnd"),
                new MText({ text: "." + rel.source_column }).addStyleClass("sapUiTinyMarginEnd"),
                new sap.ui.core.Icon({ src: "sap-icon://arrow-right", size: "0.875rem", color: "#888" }).addStyleClass("sapUiTinyMarginEnd"),
                new sap.m.ObjectStatus({ text: rel.target_column, state: "Success" })
              ]
            }).addStyleClass("sapUiTinyMarginBottom"));
          });
        }

        oPanel.addContent(oPanelContent);
        oContainer.addItem(oPanel);
      });
    },

    _navigateToTable: function (sTable) {
      // Sol panelde tabloyu sec ve verisini yukle
      this._oModel.setProperty("/selectedTable", sTable);
      this._oModel.setProperty("/offset", 0);
      this._loadTableSchema(sTable);
      this._loadTableData(sTable);

      // Sol listedeki secimi guncelle
      var oList = this.byId("tableList");
      if (oList) {
        var aItems = oList.getItems();
        for (var i = 0; i < aItems.length; i++) {
          var oCtx = aItems[i].getBindingContext("dbc");
          if (oCtx && oCtx.getObject().name === sTable) {
            oList.setSelectedItem(aItems[i]);
            break;
          }
        }
      }

      // Veri sekmesine gec
      var oTabs = this.byId("mainTabs");
      if (oTabs) oTabs.setSelectedKey("data");
    },

    onRelationshipSearch: function (oEvent) {
      var q = (oEvent.getParameter("newValue") || "").toLowerCase();
      if (!q) {
        this._buildRelationshipPanels(this._allRelationships || []);
        return;
      }
      var filtered = (this._allRelationships || []).filter(function (r) {
        return r.source_table.toLowerCase().indexOf(q) >= 0 ||
               r.target_table.toLowerCase().indexOf(q) >= 0 ||
               r.source_column.toLowerCase().indexOf(q) >= 0 ||
               r.target_column.toLowerCase().indexOf(q) >= 0;
      });
      this._buildRelationshipPanels(filtered);
    },

    onRefreshRelationships: function () {
      this._loadRelationships();
      MessageToast.show(this._i18n("msgRefreshed"));
    },

    /* ═══ Kayitli Sorgular ═══ */

    _SAVED_QUERY_KEY: "redigo_db_cockpit_saved_queries",
    _MAX_SAVED_QUERIES: 5,

    _loadSavedQueriesRaw: function () {
      // onInit'te i18n hazir olmayabilir, sadece veriyi yukle
      var aQueries = this._getSavedQueriesFromStorage();
      var aItems = [{ key: "__empty__", name: "— Kayıtlı sorgu seçin —", sql: "" }];
      aQueries.forEach(function (q, i) {
        aItems.push({ key: "q_" + i, name: q.name, sql: q.sql });
      });
      this._oModel.setProperty("/savedQueries", aItems);
    },

    _getSavedQueriesFromStorage: function () {
      var sData = localStorage.getItem(this._SAVED_QUERY_KEY);
      try {
        return sData ? JSON.parse(sData) : [];
      } catch (e) {
        return [];
      }
    },

    _loadSavedQueries: function () {
      var aQueries = this._getSavedQueriesFromStorage();
      var sPlaceholder = "— " + this._i18n("dbCockpitSelectSavedQuery") + " —";
      var aItems = [{ key: "__empty__", name: sPlaceholder, sql: "" }];
      aQueries.forEach(function (q, i) {
        aItems.push({ key: "q_" + i, name: q.name, sql: q.sql });
      });
      this._oModel.setProperty("/savedQueries", aItems);
      var oCount = this.byId("savedQueryCount");
      if (oCount) oCount.setText(aQueries.length + " / " + this._MAX_SAVED_QUERIES);
    },

    _persistSavedQueries: function () {
      var aAll = this._oModel.getProperty("/savedQueries") || [];
      var aToSave = aAll.filter(function (q) { return q.key !== "__empty__"; }).map(function (q) {
        return { name: q.name, sql: q.sql };
      });
      localStorage.setItem(this._SAVED_QUERY_KEY, JSON.stringify(aToSave));
    },

    onSaveQuery: function () {
      var oEditor = this.byId("sqlEditor");
      var sSql = (oEditor.getValue() || "").trim();
      if (!sSql) {
        MessageToast.show(this._i18n("dbCockpitSqlEmpty"));
        return;
      }

      var aAll = this._oModel.getProperty("/savedQueries") || [];
      var iCount = aAll.filter(function (q) { return q.key !== "__empty__"; }).length;
      if (iCount >= this._MAX_SAVED_QUERIES) {
        MessageBox.warning(this._i18n("dbCockpitMaxQueries", [this._MAX_SAVED_QUERIES]));
        return;
      }

      var that = this;
      // Sorgu adi sor
      var oInput = new sap.m.Input({ width: "100%", placeholder: "SELECT * FROM ..." });
      var oSaveDialog = new Dialog({
        title: this._i18n("dbCockpitSaveQuery"),
        contentWidth: "400px",
        content: [
          new VBox({
            class: "sapUiSmallMargin",
            items: [
              new Label({ text: this._i18n("dbCockpitQueryName"), required: true }),
              oInput
            ]
          })
        ],
        beginButton: new Button({
          text: this._i18n("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sName = (oInput.getValue() || "").trim();
            if (!sName) {
              MessageToast.show(that._i18n("msgRequiredFields"));
              return;
            }
            var aAll2 = that._oModel.getProperty("/savedQueries") || [];
            aAll2.push({ key: "q_" + Date.now(), name: sName, sql: sSql });
            that._oModel.setProperty("/savedQueries", aAll2);
            that._persistSavedQueries();
            that._loadSavedQueries();
            MessageToast.show(that._i18n("msgSaved"));
            oSaveDialog.close();
          }
        }),
        endButton: new Button({
          text: this._i18n("cfgCancel"),
          press: function () { oSaveDialog.close(); }
        }),
        afterClose: function () { oSaveDialog.destroy(); }
      });
      oSaveDialog.open();
    },

    onLoadSavedQuery: function (oEvent) {
      var oItem = oEvent.getParameter("selectedItem");
      if (!oItem) return;
      var oCtx = oItem.getBindingContext("dbc");
      if (!oCtx) return;
      var oQuery = oCtx.getObject();
      if (oQuery.key === "__empty__") return;
      var oEditor = this.byId("sqlEditor");
      if (oEditor) oEditor.setValue(oQuery.sql);
    },

    onDeleteQuery: function () {
      var oSelect = this.byId("savedQuerySelect");
      if (!oSelect) return;
      var sKey = oSelect.getSelectedKey();
      if (!sKey || sKey === "__empty__") {
        MessageToast.show(this._i18n("dbCockpitSelectSavedQuery"));
        return;
      }

      var that = this;
      MessageBox.confirm(this._i18n("msgConfirmDelete"), {
        title: this._i18n("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            var aAll = that._oModel.getProperty("/savedQueries") || [];
            var aFiltered = aAll.filter(function (q) { return q.key !== sKey; });
            that._oModel.setProperty("/savedQueries", aFiltered);
            that._persistSavedQueries();
            that._loadSavedQueries();
            oSelect.setSelectedKey("__empty__");
            MessageToast.show(that._i18n("msgDeleted"));
          }
        }
      });
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

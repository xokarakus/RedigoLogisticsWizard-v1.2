sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Text",
  "sap/m/Table",
  "sap/m/Column",
  "sap/m/ColumnListItem",
  "sap/m/ObjectStatus",
  "sap/ui/core/Fragment",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button,
             Text, Table, Column, ColumnListItem, ObjectStatus,
             Fragment, API) {
  "use strict";

  var JOB_TYPES = {
    FETCH_FROM_SAP: "SAP'den Veri \u00c7ek",
    SEND_TO_3PL: "3PL'ye G\u00f6nder",
    POST_GOODS_ISSUE: "Mal \u00c7\u0131k\u0131\u015f\u0131 (PGI)",
    POST_GOODS_RECEIPT: "Mal Giri\u015fi (PGR)",
    QUERY_STATUS: "Durum Sorgula",
    RECONCILIATION: "Mutabakat",
    CLEANUP_LOGS: "Log Temizleme"
  };

  var SCHEDULE_TYPES = {
    MANUAL: "Manuel",
    IMMEDIATE: "Hemen",
    ONCE: "Bir Kere",
    PERIODIC: "Periyodik"
  };

  var CLASS_LABELS = { A: "A - Y\u00fcksek", B: "B - Orta", C: "C - D\u00fc\u015f\u00fck" };

  function fmtDate(d) {
    if (!d) return "";
    return new Date(d).toLocaleString("tr-TR");
  }

  return Controller.extend("com.redigo.logistics.cockpit.controller.JobManagement", {

    onInit: function () {
      this._oModel = new JSONModel({ data: [], filtered: [], summary: "" });
      this.getView().setModel(this._oModel, "jobs");
      this._loadData();
    },

    _onBeforeShow: function () {
      this._loadData();
    },

    _loadData: function () {
      var that = this;
      API.get("/api/scheduled-jobs").then(function (res) {
        var aData = (res.data || []).map(function (j) {
          j._typeText = JOB_TYPES[j.job_type] || j.job_type;
          j._scheduleTypeText = SCHEDULE_TYPES[j.schedule_type] || j.schedule_type;
          j._cronText = j.cron_expression || "";
          j._lastRunFmt = fmtDate(j.last_run_at);
          j._nextRunFmt = fmtDate(j.next_run_at);
          j._classText = CLASS_LABELS[j.job_class] || j.job_class;
          return j;
        });
        that._oModel.setProperty("/data", aData);
        that._applyFilters();
      });
    },

    onRefresh: function () {
      this._loadData();
      MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgRefreshed"));
    },

    onSearch: function () { this._applyFilters(); },
    onFilterChange: function () { this._applyFilters(); },

    _applyFilters: function () {
      var oView = this.getView();
      var oSearch = oView.byId("jobSearch");
      var oTypeFilter = oView.byId("jobTypeFilter");
      var oStatusFilter = oView.byId("jobStatusFilter");

      var sQuery = oSearch ? (oSearch.getValue() || "").toLowerCase() : "";
      var sType = oTypeFilter ? oTypeFilter.getSelectedKey() : "";
      var sStatus = oStatusFilter ? oStatusFilter.getSelectedKey() : "";
      var aData = this._oModel.getProperty("/data") || [];

      var aFiltered = aData.filter(function (j) {
        if (sQuery) {
          var bMatch = (j.name || "").toLowerCase().indexOf(sQuery) >= 0 ||
            (j.description || "").toLowerCase().indexOf(sQuery) >= 0;
          if (!bMatch) return false;
        }
        if (sType && sType !== "ALL" && j.job_type !== sType) return false;
        if (sStatus === "active" && !j.is_active) return false;
        if (sStatus === "passive" && j.is_active) return false;
        return true;
      });

      this._oModel.setProperty("/filtered", aFiltered);
      var oI18n = oView.getModel("i18n");
      if (oI18n) {
        this._oModel.setProperty("/summary", oI18n.getResourceBundle().getText("jobCount", [aFiltered.length]));
      } else {
        this._oModel.setProperty("/summary", aFiltered.length + " i\u015f");
      }
    },

    // ── CRUD ──

    onAddJob: function () {
      this._openDialog(null);
    },

    onEditJob: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("jobs");
      this._openDialog(oCtx.getObject());
    },

    onDeleteJob: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("jobs");
      var oJob = oCtx.getObject();
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      MessageBox.confirm(
        oBundle.getText("msgConfirmDelete") + "\n\n" + oJob.name,
        {
          title: oBundle.getText("msgConfirmDeleteTitle"),
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) return;
            API.del("/api/scheduled-jobs/" + oJob.id).then(function (res) {
              if (res.error) { MessageBox.error(res.error); return; }
              MessageToast.show(oBundle.getText("msgDeleted"));
              that._loadData();
            });
          }
        }
      );
    },

    // ── Run / Toggle ──

    onRunJob: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("jobs");
      var oJob = oCtx.getObject();
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      MessageBox.confirm(
        oBundle.getText("jobRunConfirm", [oJob.name]),
        {
          title: oBundle.getText("jobRun"),
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) return;
            API.post("/api/scheduled-jobs/" + oJob.id + "/run").then(function (res) {
              if (res.error) { MessageBox.error(res.error); return; }
              var exec = res.data || {};
              MessageToast.show(oBundle.getText("jobRunComplete", [exec.status, exec.duration_ms]));
              that._loadData();
            });
          }
        }
      );
    },

    onToggleJob: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("jobs");
      var oJob = oCtx.getObject();
      var that = this;
      API.post("/api/scheduled-jobs/" + oJob.id + "/toggle").then(function (res) {
        if (res.error) { MessageToast.show(res.error); return; }
        that._loadData();
      });
    },

    // ── Job Detail (Execution History) ──

    onJobPress: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("jobs");
      var oJob = oCtx.getObject();
      this._showExecutionHistory(oJob);
    },

    _showExecutionHistory: function (oJob) {
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      API.get("/api/scheduled-jobs/" + oJob.id + "/executions?limit=20").then(function (res) {
        var aExecs = res.data || [];

        var oTable = new Table({
          growing: true,
          growingThreshold: 20,
          mode: "SingleSelectMaster",
          selectionChange: function (oEvt) {
            var oItem = oEvt.getParameter("listItem");
            var oExec = oItem && oItem.data("exec");
            if (oExec) {
              that._showExecutionItems(oJob.id, oExec);
            }
          },
          columns: [
            new Column({ header: new Text({ text: oBundle.getText("woStatus") }), width: "6em" }),
            new Column({ header: new Text({ text: oBundle.getText("txStarted") }) }),
            new Column({ header: new Text({ text: oBundle.getText("txDuration") }), hAlign: "End", width: "6em" }),
            new Column({ header: new Text({ text: oBundle.getText("jobProcessed") }), hAlign: "Center", width: "8em" }),
            new Column({ header: new Text({ text: oBundle.getText("jobTriggeredBy") }), width: "6em" }),
            new Column({ header: new Text({ text: oBundle.getText("txError") }) })
          ]
        });

        aExecs.forEach(function (e) {
          var oItem = new ColumnListItem({
            type: "Active",
            highlight: e.status === "SUCCESS" ? "Success" : e.status === "FAILED" ? "Error" : e.status === "RUNNING" ? "Warning" : "None",
            cells: [
              new ObjectStatus({
                text: e.status,
                state: e.status === "SUCCESS" ? "Success" : e.status === "FAILED" ? "Error" : e.status === "RUNNING" ? "Warning" : "None"
              }),
              new Text({ text: fmtDate(e.started_at) }),
              new Text({ text: e.duration_ms ? e.duration_ms + " ms" : "" }),
              new Text({ text: (e.success_count || 0) + " / " + (e.fail_count || 0) + " / " + (e.processed_count || 0) }),
              new Text({ text: e.triggered_by || "" }),
              new Text({ text: e.error_message || "", maxLines: 1 })
            ]
          });
          oItem.data("exec", e);
          oTable.addItem(oItem);
        });

        if (aExecs.length === 0) {
          oTable.setNoDataText(oBundle.getText("jobNoExecutions"));
        }

        var oDialog = new Dialog({
          title: oBundle.getText("jobExecutions") + ": " + oJob.name,
          contentWidth: "800px",
          verticalScrolling: true,
          content: [oTable],
          endButton: new Button({
            text: oBundle.getText("cfgCancel"),
            press: function () { oDialog.close(); }
          }),
          afterClose: function () { oDialog.destroy(); }
        });

        that.getView().addDependent(oDialog);
        oDialog.open();
      });
    },

    /**
     * Execution bireysel is emri sonuclarini goster.
     */
    _showExecutionItems: function (sJobId, oExec) {
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      API.get("/api/scheduled-jobs/" + sJobId + "/executions/" + oExec.id + "/items").then(function (res) {
        var aItems = res.data || [];

        if (aItems.length === 0) {
          MessageToast.show(oBundle.getText("jobNoItems") || "Bu \u00e7al\u0131\u015fmada bireysel kay\u0131t yok");
          return;
        }

        var oItemTable = new Table({
          growing: true,
          growingThreshold: 50,
          columns: [
            new Column({ header: new Text({ text: oBundle.getText("woDeliveryNo") }), width: "10em" }),
            new Column({ header: new Text({ text: oBundle.getText("woStatus") }), width: "6em" }),
            new Column({ header: new Text({ text: oBundle.getText("woPlant") }), width: "6em" }),
            new Column({ header: new Text({ text: oBundle.getText("txError") }) })
          ]
        });

        var bHasFailed = false;
        aItems.forEach(function (item) {
          if (item.status === "FAILED") bHasFailed = true;
          oItemTable.addItem(new ColumnListItem({
            highlight: item.status === "SUCCESS" ? "Success" : item.status === "FAILED" ? "Error" : "Warning",
            cells: [
              new Text({ text: item.sap_delivery_no || "-" }),
              new ObjectStatus({
                text: item.status,
                state: item.status === "SUCCESS" ? "Success" : item.status === "FAILED" ? "Error" : "Warning"
              }),
              new Text({ text: item.plant_code || "" }),
              new Text({ text: item.error_message || "", maxLines: 2 })
            ]
          }));
        });

        var aButtons = [];
        if (bHasFailed) {
          aButtons.push(new Button({
            text: oBundle.getText("jobRetryFailed") || "Hatal\u0131lar\u0131 Yeniden Dene",
            type: "Emphasized",
            icon: "sap-icon://refresh",
            press: function () {
              API.post("/api/scheduled-jobs/" + sJobId + "/executions/" + oExec.id + "/retry-failed").then(function (r) {
                if (r.error) { MessageBox.error(r.error); return; }
                MessageToast.show(oBundle.getText("jobRetryStarted") || "Yeniden deneme ba\u015flat\u0131ld\u0131");
                oItemDialog.close();
                that._loadData();
              });
            }
          }));
        }

        var oItemDialog = new Dialog({
          title: oBundle.getText("jobExecutionItems") || "\u0130\u015f Emri Sonu\u00e7lar\u0131",
          subHeader: new sap.m.Toolbar({
            content: [
              new ObjectStatus({ text: aItems.length + " kay\u0131t", state: "Information" }),
              new sap.m.ToolbarSpacer(),
              new ObjectStatus({
                text: aItems.filter(function (i) { return i.status === "SUCCESS"; }).length + " ba\u015far\u0131l\u0131",
                state: "Success"
              }),
              new ObjectStatus({
                text: aItems.filter(function (i) { return i.status === "FAILED"; }).length + " hatal\u0131",
                state: "Error",
                visible: bHasFailed
              })
            ]
          }),
          contentWidth: "650px",
          verticalScrolling: true,
          content: [oItemTable],
          beginButton: bHasFailed ? aButtons[0] : null,
          endButton: new Button({
            text: oBundle.getText("cfgCancel"),
            press: function () { oItemDialog.close(); }
          }),
          afterClose: function () { oItemDialog.destroy(); }
        });

        that.getView().addDependent(oItemDialog);
        oItemDialog.open();
      });
    },

    // ── Fragment-based Dialog ──

    /**
     * Cron expression'dan periyot alanlarini parse et (edit icin).
     */
    _parseCronToFields: function (sCron) {
      var r = {
        period_type: "HOURLY", period_minutes: "30", period_hours: "1",
        daily_time: "06:00", weekly_time: "06:00", monthly_time: "06:00",
        monthly_day: "1",
        week_mon: false, week_tue: false, week_wed: false, week_thu: false,
        week_fri: false, week_sat: false, week_sun: false
      };
      if (!sCron) return r;
      var p = sCron.trim().split(/\s+/);
      if (p.length < 5) return r;

      var min = p[0], hour = p[1], dom = p[2], mon = p[3], dow = p[4];

      // */N * * * * → dakika bazli
      if (min.indexOf("*/") === 0 && hour === "*") {
        r.period_type = "MINUTELY";
        r.period_minutes = min.substring(2);
        return r;
      }
      // M */N * * * → saatlik
      if (hour.indexOf("*/") === 0) {
        r.period_type = "HOURLY";
        r.period_hours = hour.substring(2);
        return r;
      }
      // M H * * DOW → haftalik
      if (dow !== "*" && dom === "*" && mon === "*") {
        r.period_type = "WEEKLY";
        r.weekly_time = (hour !== "*" ? hour : "0").padStart(2, "0") + ":" + (min !== "*" ? min : "0").padStart(2, "0");
        var days = dow.split(",");
        days.forEach(function (d) {
          var n = parseInt(d);
          if (n === 1) r.week_mon = true;
          if (n === 2) r.week_tue = true;
          if (n === 3) r.week_wed = true;
          if (n === 4) r.week_thu = true;
          if (n === 5) r.week_fri = true;
          if (n === 6) r.week_sat = true;
          if (n === 0 || n === 7) r.week_sun = true;
        });
        return r;
      }
      // M H DOM * * → aylik
      if (dom !== "*" && mon === "*" && dow === "*") {
        r.period_type = "MONTHLY";
        r.monthly_day = dom;
        r.monthly_time = (hour !== "*" ? hour : "0").padStart(2, "0") + ":" + (min !== "*" ? min : "0").padStart(2, "0");
        return r;
      }
      // M H * * * → gunluk
      if (dom === "*" && mon === "*" && dow === "*") {
        r.period_type = "DAILY";
        r.daily_time = (hour !== "*" ? hour : "0").padStart(2, "0") + ":" + (min !== "*" ? min : "0").padStart(2, "0");
        return r;
      }
      return r;
    },

    /**
     * Periyot alanlarindan cron expression olustur.
     */
    _buildCron: function (oData) {
      var t = oData.period_type;
      if (t === "MINUTELY") {
        var m = Math.max(1, Math.min(59, parseInt(oData.period_minutes) || 30));
        return "*/" + m + " * * * *";
      }
      if (t === "HOURLY") {
        var h = Math.max(1, Math.min(23, parseInt(oData.period_hours) || 1));
        return "0 */" + h + " * * *";
      }
      if (t === "DAILY") {
        var parts = (oData.daily_time || "06:00").split(":");
        return (parseInt(parts[1]) || 0) + " " + (parseInt(parts[0]) || 6) + " * * *";
      }
      if (t === "WEEKLY") {
        var days = [];
        if (oData.week_mon) days.push("1");
        if (oData.week_tue) days.push("2");
        if (oData.week_wed) days.push("3");
        if (oData.week_thu) days.push("4");
        if (oData.week_fri) days.push("5");
        if (oData.week_sat) days.push("6");
        if (oData.week_sun) days.push("0");
        if (days.length === 0) days.push("1");
        var wp = (oData.weekly_time || "06:00").split(":");
        return (parseInt(wp[1]) || 0) + " " + (parseInt(wp[0]) || 6) + " * * " + days.join(",");
      }
      if (t === "MONTHLY") {
        var d = Math.max(1, Math.min(31, parseInt(oData.monthly_day) || 1));
        var mp = (oData.monthly_time || "06:00").split(":");
        return (parseInt(mp[1]) || 0) + " " + (parseInt(mp[0]) || 6) + " " + d + " * *";
      }
      return "0 */1 * * *";
    },

    _openDialog: function (oJob) {
      var bEdit = !!oJob;
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      // Periyot alanlarini parse et
      var oFields = this._parseCronToFields(bEdit ? oJob.cron_expression : null);

      // ONCE icin tarih/saat ayir
      var sOnceDate = "", sOnceTime = "";
      if (bEdit && oJob.scheduled_at) {
        var dt = new Date(oJob.scheduled_at);
        sOnceDate = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0");
        sOnceTime = String(dt.getHours()).padStart(2, "0") + ":" + String(dt.getMinutes()).padStart(2, "0");
      }

      var oDialogModel = new JSONModel({
        title: bEdit ? oBundle.getText("jobEdit") + ": " + oJob.name : oBundle.getText("jobAdd"),
        name: bEdit ? oJob.name : "",
        description: bEdit ? (oJob.description || "") : "",
        job_type: bEdit ? oJob.job_type : "FETCH_FROM_SAP",
        job_class: bEdit ? (oJob.job_class || "B") : "B",
        schedule_type: bEdit ? (oJob.schedule_type || "MANUAL") : "MANUAL",
        cron_expression: bEdit ? (oJob.cron_expression || "") : "",
        configJson: bEdit ? JSON.stringify(oJob.config || {}, null, 2) : "{}",
        _editId: bEdit ? oJob.id : null,
        // ONCE
        once_date: sOnceDate,
        once_time: sOnceTime,
        // Periyot alanlari
        period_type: oFields.period_type,
        period_minutes: oFields.period_minutes,
        period_hours: oFields.period_hours,
        daily_time: oFields.daily_time,
        weekly_time: oFields.weekly_time,
        monthly_time: oFields.monthly_time,
        monthly_day: oFields.monthly_day,
        week_mon: oFields.week_mon,
        week_tue: oFields.week_tue,
        week_wed: oFields.week_wed,
        week_thu: oFields.week_thu,
        week_fri: oFields.week_fri,
        week_sat: oFields.week_sat,
        week_sun: oFields.week_sun
      });

      // Onceki dialog varsa kapat
      if (this._oJobDialog) {
        this._oJobDialog.destroy();
        this._oJobDialog = null;
      }

      Fragment.load({
        name: "com.redigo.logistics.cockpit.view.JobDialog",
        controller: this
      }).then(function (oDialog) {
        that._oJobDialog = oDialog;
        oDialog.setModel(oDialogModel, "dialog");
        that.getView().addDependent(oDialog);
        // Ilk cron hesapla
        if (oDialogModel.getProperty("/schedule_type") === "PERIODIC") {
          that._updateCron();
        }
        oDialog.open();
      }).catch(function (err) {
        console.error("Fragment load error:", err);
        MessageBox.error("Dialog y\u00fcklenemedi: " + err.message);
      });
    },

    _updateCron: function () {
      if (!this._oJobDialog) return;
      var oModel = this._oJobDialog.getModel("dialog");
      var oData = oModel.getData();
      var sCron = this._buildCron(oData);
      oModel.setProperty("/cron_expression", sCron);
    },

    onScheduleTypeChange: function () {
      // Periyodik secildiginde cron guncelle
      if (this._oJobDialog) {
        var sType = this._oJobDialog.getModel("dialog").getProperty("/schedule_type");
        if (sType === "PERIODIC") {
          this._updateCron();
        }
      }
    },

    onPeriodTypeChange: function () {
      this._updateCron();
    },

    onDialogSave: function () {
      var oDialog = this._oJobDialog;
      if (!oDialog) return;

      var oData = oDialog.getModel("dialog").getData();
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      var that = this;

      var sName = (oData.name || "").trim();
      if (!sName) {
        MessageToast.show(oBundle.getText("msgRequiredFields"));
        return;
      }

      var oConfig;
      try {
        oConfig = JSON.parse(oData.configJson || "{}");
      } catch (e) {
        MessageToast.show(oBundle.getText("msgInvalidJSON"));
        return;
      }

      // Cron'u periyot alanlarindan guncelle
      var sCron = null;
      if (oData.schedule_type === "PERIODIC") {
        sCron = this._buildCron(oData);
      }

      // ONCE icin scheduled_at olustur
      var sScheduledAt = null;
      if (oData.schedule_type === "ONCE" && oData.once_date) {
        sScheduledAt = oData.once_date + "T" + (oData.once_time || "00:00");
      }

      var oPayload = {
        name: sName,
        description: (oData.description || "").trim() || null,
        job_type: oData.job_type,
        job_class: oData.job_class,
        schedule_type: oData.schedule_type,
        cron_expression: sCron,
        scheduled_at: sScheduledAt,
        config: oConfig
      };

      var bEdit = !!oData._editId;
      var prom = bEdit
        ? API.put("/api/scheduled-jobs/" + oData._editId, oPayload)
        : API.post("/api/scheduled-jobs", oPayload);

      prom.then(function (res) {
        if (res.error) { MessageToast.show(res.error); return; }
        MessageToast.show(oBundle.getText("msgSaved"));
        oDialog.close();
        that._loadData();
      });
    },

    onDialogCancel: function () {
      if (this._oJobDialog) {
        this._oJobDialog.close();
      }
    }
  });
});

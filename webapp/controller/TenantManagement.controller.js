sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Select",
  "sap/m/TextArea",
  "sap/m/Title",
  "sap/ui/core/Item",
  "sap/ui/layout/form/SimpleForm",
  "sap/m/List",
  "sap/m/StandardListItem",
  "sap/m/CheckBox",
  "sap/m/MessageStrip",
  "sap/m/VBox",
  "sap/m/HBox",
  "sap/m/Text",
  "sap/m/BusyIndicator",
  "sap/m/ObjectStatus",
  "sap/m/Wizard",
  "sap/m/WizardStep",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Label, Input,
             Select, TextArea, Title, Item, SimpleForm, List, StandardListItem, CheckBox,
             MessageStrip, VBox, HBox, Text, BusyIndicator, ObjectStatus, Wizard, WizardStep, API) {
  "use strict";

  return Controller.extend("com.redigo.logistics.cockpit.controller.TenantManagement", {

    onInit: function () {
      this._oModel = new JSONModel({ data: [], filtered: [], summary: "" });
      this.getView().setModel(this._oModel, "tenants");
      this._loadData();
    },

    _onBeforeShow: function () {
      this._loadData();
    },

    _loadData: function () {
      var that = this;
      Promise.all([
        API.get("/api/auth/tenants"),
        API.get("/api/auth/tenants/stats")
      ]).then(function (results) {
        var aData = results[0].data || [];
        var oStats = results[1].data || {};

        // Her tenant'a istatistikleri ekle
        aData.forEach(function (t) {
          var s = oStats[t.id] || {};
          t._stats = {
            total_users: s.total_users || 0,
            active_users: s.active_users || 0,
            inactive_users: s.inactive_users || 0,
            total_orders: s.total_orders || 0,
            open_orders: s.open_orders || 0,
            completed_orders: s.completed_orders || 0,
            failed_orders: s.failed_orders || 0,
            total_transactions: s.total_transactions || 0,
            success_transactions: s.success_transactions || 0,
            failed_transactions: s.failed_transactions || 0,
            warehouse_count: s.warehouse_count || 0,
            field_mapping_count: s.field_mapping_count || 0,
            security_profile_count: s.security_profile_count || 0,
            last_login_fmt: s.last_login ? new Date(s.last_login).toLocaleString("tr-TR") : "",
            last_order_fmt: s.last_order_at ? new Date(s.last_order_at).toLocaleString("tr-TR") : ""
          };
          t.user_count = s.total_users || 0;
        });

        that._oModel.setProperty("/data", aData);
        that._oModel.setProperty("/filtered", aData);
        var oI18n = that.getView().getModel("i18n");
        var sSummary = oI18n ? oI18n.getResourceBundle().getText("tmTenantCount", [aData.length]) : aData.length + " firma";
        that._oModel.setProperty("/summary", sSummary);
      });
    },

    onRefresh: function () {
      this._loadData();
      var oBundle = this.getView().getModel("i18n").getResourceBundle();
      MessageToast.show(oBundle.getText("msgRefreshed"));
    },

    onSearch: function () {
      this._applyFilters();
    },

    onFilterChange: function () {
      this._applyFilters();
    },

    _applyFilters: function () {
      var oView = this.getView();
      var sQuery = (oView.byId("tmSearch").getValue() || "").toLowerCase();
      var sPlan = oView.byId("tmPlanFilter").getSelectedKey();
      var sStatus = oView.byId("tmStatusFilter").getSelectedKey();
      var aData = this._oModel.getProperty("/data") || [];

      var aFiltered = aData.filter(function (t) {
        // Text search
        if (sQuery) {
          var bMatch = (t.code || "").toLowerCase().indexOf(sQuery) >= 0 ||
            (t.name || "").toLowerCase().indexOf(sQuery) >= 0 ||
            (t.domain || "").toLowerCase().indexOf(sQuery) >= 0 ||
            (t.contact_person || "").toLowerCase().indexOf(sQuery) >= 0;
          if (!bMatch) { return false; }
        }
        // Plan filter
        if (sPlan && sPlan !== "ALL" && t.plan !== sPlan) { return false; }
        // Status filter
        if (sStatus === "active" && !t.is_active) { return false; }
        if (sStatus === "passive" && t.is_active) { return false; }
        return true;
      });

      this._oModel.setProperty("/filtered", aFiltered);
      var oI18n = oView.getModel("i18n");
      var sSummary = oI18n ? oI18n.getResourceBundle().getText("tmTenantCount", [aFiltered.length]) : aFiltered.length + " firma";
      this._oModel.setProperty("/summary", sSummary);
    },

    onAddTenant: function () {
      this._openDialog(null);
    },

    onEditTenant: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("tenants");
      var oTenant = oCtx.getObject();
      this._openDialog(oTenant);
    },

    onImpersonate: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("tenants");
      var oTenant = oCtx.getObject();
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      MessageBox.confirm("\"" + oTenant.name + "\" olarak i\u015flem yapmak istiyor musunuz?", {
        title: oBundle.getText("tmImpersonate"),
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) return;
          API.post("/api/auth/impersonate", { tenant_id: oTenant.id }).then(function (res) {
            if (res.error) {
              MessageToast.show(res.error);
              return;
            }
            API.setToken(res.token);
            location.reload();
          });
        }
      });
    },

    onDeleteTenant: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("tenants");
      var oTenant = oCtx.getObject();
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      MessageBox.confirm(
        oBundle.getText("msgConfirmDelete") + "\n\n" + oTenant.code + " - " + oTenant.name,
        {
          title: oBundle.getText("msgConfirmDeleteTitle"),
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) return;
            API.del("/api/auth/tenants/" + oTenant.id).then(function (res) {
              if (res.error) {
                MessageBox.error(res.error);
                return;
              }
              MessageToast.show(oBundle.getText("msgDeleted"));
              that._loadData();
            });
          }
        }
      );
    },

    _openDialog: function (oTenant) {
      var bEdit = !!oTenant;
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      // ── Form alanları ──
      var oCodeInput = new Input({
        value: bEdit ? oTenant.code : "",
        enabled: !bEdit,
        placeholder: oBundle.getText("tmCodePlaceholder"),
        maxLength: 20
      });

      var oNameInput = new Input({
        value: bEdit ? oTenant.name : "",
        placeholder: oBundle.getText("tmName")
      });

      var oDomainInput = new Input({
        value: bEdit ? (oTenant.domain || "") : "",
        placeholder: "\u00d6rn: tesla.com"
      });

      var oTaxIdInput = new Input({
        value: bEdit ? (oTenant.tax_id || "") : "",
        placeholder: "1234567890",
        maxLength: 20
      });

      var oTaxOfficeInput = new Input({
        value: bEdit ? (oTenant.tax_office || "") : "",
        placeholder: oBundle.getText("tmTaxOffice")
      });

      var oAddressInput = new TextArea({
        value: bEdit ? (oTenant.address || "") : "",
        rows: 2,
        width: "100%",
        placeholder: oBundle.getText("tmAddress")
      });

      var oIbanInput = new Input({
        value: bEdit ? (oTenant.iban || "") : "",
        placeholder: "TR00 0000 0000 0000 0000 0000 00",
        maxLength: 50
      });

      var oContactInput = new Input({
        value: bEdit ? (oTenant.contact_person || "") : "",
        placeholder: oBundle.getText("tmContactPerson")
      });

      var oPhoneInput = new Input({
        value: bEdit ? (oTenant.phone || "") : "",
        placeholder: "+90 212 000 0000",
        type: "Tel"
      });

      var oPlanSelect = new Select({
        selectedKey: bEdit ? (oTenant.plan || "standard") : "standard",
        width: "100%",
        items: [
          new Item({ key: "standard", text: oBundle.getText("tmPlanStandard") }),
          new Item({ key: "professional", text: oBundle.getText("tmPlanProfessional") }),
          new Item({ key: "enterprise", text: oBundle.getText("tmPlanEnterprise") })
        ]
      });

      var oStatusSelect = new Select({
        selectedKey: bEdit ? (oTenant.is_active ? "active" : "passive") : "active",
        width: "100%",
        items: [
          new Item({ key: "active", text: oBundle.getText("tmStatusActive") }),
          new Item({ key: "passive", text: oBundle.getText("tmStatusPassive") })
        ]
      });

      // Yeni tenant için admin alanları (şifre yok — e-posta ile reset gönderilecek)
      var oAdminUserInput = new Input({ value: "", placeholder: "araskargo_admin" });
      var oAdminEmailInput = new Input({ value: "", placeholder: "admin@firma.com", type: "Email" });

      // Domain değiştiğinde admin alanlarını otomatik doldur
      oDomainInput.attachLiveChange(function () {
        var sDomain = oDomainInput.getValue().trim().toLowerCase();
        if (!sDomain) return;
        var sBase = sDomain.split(".")[0].replace(/[^a-z0-9]/g, "");
        if (sBase) {
          if (!oAdminUserInput._userEdited) {
            oAdminUserInput.setValue(sBase + "_admin");
          }
          if (!oAdminEmailInput._userEdited) {
            oAdminEmailInput.setValue("admin@" + sDomain);
          }
        }
      });
      oAdminUserInput.attachLiveChange(function () { oAdminUserInput._userEdited = true; });
      oAdminEmailInput.attachLiveChange(function () { oAdminEmailInput._userEdited = true; });

      // ── Form yapısı (screenshot'a uygun gruplar) ──
      var aContent = [
        new Title({ text: oBundle.getText("tmCode") }),
        new Label({ text: oBundle.getText("tmCode") }), oCodeInput,
        new Label({ text: oBundle.getText("tmName"), required: true }), oNameInput,
        new Label({ text: oBundle.getText("tmDomain"), required: true }), oDomainInput,

        new Title({ text: oBundle.getText("tmTaxId") }),
        new Label({ text: oBundle.getText("tmTaxId") }), oTaxIdInput,
        new Label({ text: oBundle.getText("tmTaxOffice") }), oTaxOfficeInput,

        new Title({ text: oBundle.getText("tmAddress") }),
        new Label({ text: oBundle.getText("tmAddress") }), oAddressInput,

        new Title({ text: oBundle.getText("tmIban") }),
        new Label({ text: oBundle.getText("tmIban") }), oIbanInput,

        new Title({ text: oBundle.getText("tmContactPerson") }),
        new Label({ text: oBundle.getText("tmContactPerson") }), oContactInput,
        new Label({ text: oBundle.getText("tmPhone") }), oPhoneInput,

        new Title({ text: oBundle.getText("tmPlan") }),
        new Label({ text: oBundle.getText("tmPlan") }), oPlanSelect,
        new Label({ text: oBundle.getText("tmStatus") }), oStatusSelect
      ];

      if (!bEdit) {
        aContent.push(
          new Title({ text: oBundle.getText("tmAdminUsername") }),
          new Label({ text: oBundle.getText("tmAdminUsername"), required: true }), oAdminUserInput,
          new Label({ text: oBundle.getText("tmAdminEmail"), required: true }), oAdminEmailInput
        );
      }

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0,
        columnsXL: 1, columnsL: 1, columnsM: 1,
        content: aContent
      });

      var sTitle = bEdit
        ? oBundle.getText("tmEditTenant") + ": " + oTenant.code
        : oBundle.getText("tmAddTenant");

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "520px",
        verticalScrolling: true,
        content: [oForm],
        beginButton: new Button({
          text: oBundle.getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sCode = oCodeInput.getValue().trim();
            var sName = oNameInput.getValue().trim();
            var sDomain = oDomainInput.getValue().trim().toLowerCase();

            if (!sName || !sDomain) {
              MessageToast.show(oBundle.getText("msgRequiredFields"));
              return;
            }

            var oPayload = {
              code: sCode || null,
              name: sName,
              domain: sDomain,
              tax_id: oTaxIdInput.getValue().trim() || null,
              tax_office: oTaxOfficeInput.getValue().trim() || null,
              address: oAddressInput.getValue().trim() || null,
              iban: oIbanInput.getValue().trim() || null,
              contact_person: oContactInput.getValue().trim() || null,
              phone: oPhoneInput.getValue().trim() || null,
              plan: oPlanSelect.getSelectedKey(),
              is_active: oStatusSelect.getSelectedKey() === "active"
            };

            if (!bEdit) {
              var sAdminUser = oAdminUserInput.getValue().trim();
              var sAdminEmail = oAdminEmailInput.getValue().trim();
              if (!sAdminUser || !sAdminEmail) {
                MessageToast.show(oBundle.getText("msgRequiredFields"));
                return;
              }
              // Admin e-posta domain dogrulamasi
              var sEmailDomain = (sAdminEmail.split("@")[1] || "").toLowerCase();
              if (sEmailDomain !== sDomain) {
                MessageBox.error(oBundle.getText("adminEmailDomainError", [sDomain]));
                return;
              }
              oPayload.admin_user = {
                username: sAdminUser,
                email: sAdminEmail
              };
            }

            var prom = bEdit
              ? API.put("/api/auth/tenants/" + oTenant.id, oPayload)
              : API.post("/api/auth/tenants", oPayload);

            prom.then(function (res) {
              if (res.error) {
                MessageBox.error(res.error);
                return;
              }
              oDialog.close();
              that._loadData();

              // Yeni tenant oluşturulduysa wizard öner
              if (!bEdit && res.tenant) {
                var sMsg = oBundle.getText("tmTenantCreated", [res.tenant.name, res.tenant.code]);
                MessageBox.confirm(sMsg, {
                  title: oBundle.getText("wizTitle"),
                  onClose: function (sAction) {
                    if (sAction === MessageBox.Action.OK) {
                      that._openConfigWizard(res.tenant.id, res.tenant.name);
                    } else {
                      MessageToast.show(oBundle.getText("msgSaved"), { duration: 3000 });
                    }
                  }
                });
              } else {
                MessageToast.show(oBundle.getText("msgSaved"));
              }
            });
          }
        }),
        endButton: new Button({
          text: oBundle.getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    /* ═══════════════════════════════════════════
       Konfigürasyon Sihirbazı
       ═══════════════════════════════════════════ */

    onSetupWizard: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("tenants");
      var oTenant = oCtx.getObject();
      this._openConfigWizard(oTenant.id, oTenant.name);
    },

    _openConfigWizard: function (sTenantId, sTenantName) {
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      // Wizard state model
      var oWizModel = new JSONModel({
        providers: [],
        selectedProvider: null,
        selectedSubServices: [],
        preview: null,
        result: null,
        busy: false,
        step: 1
      });

      // ── Step 1: Provider Selection ──
      var oProviderList = new List({
        mode: "SingleSelectMaster",
        selectionChange: function (oEv) {
          var oItem = oEv.getParameter("listItem");
          var oProvider = oItem.data("provider");

          // Daha once uygulanan template tekrar secilemez
          if (oProvider.already_applied) {
            oProviderList.removeSelections(true);
            oStep1.setValidated(false);
            oWizModel.setProperty("/selectedProvider", null);
            MessageToast.show(that._getText("wizAlreadyAppliedError"));
            return;
          }

          oWizModel.setProperty("/selectedProvider", oProvider);
          oWizModel.setProperty("/selectedSubServices", []);

          // HOROZ sub-services
          oSubBox.removeAllItems();
          if (oProvider.sub_services && oProvider.sub_services.length > 0) {
            oProvider.sub_services.forEach(function (sub) {
              var oCb = new CheckBox({
                text: sub.name + " (" + sub.code + ")",
                selected: true,
                select: function () {
                  that._updateSubServiceSelection(oWizModel, oSubBox);
                }
              });
              oCb.data("code", sub.code);
              oSubBox.addItem(oCb);
            });
            that._updateSubServiceSelection(oWizModel, oSubBox);
            oSubBox.setVisible(true);
          } else {
            oSubBox.setVisible(false);
          }
          oStep1.setValidated(true);
        }
      });

      var oSubBox = new VBox({ visible: false, items: [
        new Title({ text: oBundle.getText("wizSubServices") }).addStyleClass("sapUiSmallMarginTop")
      ] });

      var oStep1 = new WizardStep({
        title: oBundle.getText("wizStep1"),
        validated: false,
        content: [
          new Text({ text: oBundle.getText("wizSelectProvider") }).addStyleClass("sapUiSmallMarginBottom"),
          oProviderList,
          oSubBox
        ]
      });

      // ── Step 2: Preview ──
      var oPreviewBox = new VBox();
      var oStep2 = new WizardStep({
        title: oBundle.getText("wizStep2"),
        content: [oPreviewBox],
        activate: function () {
          that._loadPreview(oWizModel, oPreviewBox, oBundle);
        }
      });

      // ── Step 3: Apply ──
      var oResultBox = new VBox();
      var oApplyBtn = new Button({
        text: oBundle.getText("wizStep3"),
        type: "Emphasized",
        icon: "sap-icon://accept",
        press: function () {
          that._applyWizard(sTenantId, oWizModel, oResultBox, oApplyBtn, oBundle);
        }
      });

      var oStep3 = new WizardStep({
        title: oBundle.getText("wizStep3"),
        content: [oApplyBtn, oResultBox]
      });

      // ── Wizard ──
      var oWizard = new Wizard({
        showNextButton: true,
        steps: [oStep1, oStep2, oStep3]
      });

      var oDialog = new Dialog({
        title: oBundle.getText("wizTitle") + " — " + sTenantName,
        contentWidth: "680px",
        contentHeight: "520px",
        verticalScrolling: true,
        content: [oWizard],
        endButton: new Button({
          text: oBundle.getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      // Load providers (tenant_id gondererek daha once uygulananlari isaretler)
      API.get("/api/v1/config/wizard/providers", { tenant_id: sTenantId }).then(function (res) {
        var aProviders = res.data || [];
        oWizModel.setProperty("/providers", aProviders);
        aProviders.forEach(function (p) {
          var sDesc = (p.auth_type || "") + " | " +
            oBundle.getText("wizProviderInfo", [p.counts.warehouses, p.counts.process_configs, p.counts.field_mappings]);

          // Daha once uygulanan template'i isaretle
          if (p.already_applied) {
            var dApplied = new Date(p.applied_at);
            var sAppliedSubs = "";
            if (p.applied_sub_services && p.applied_sub_services.length > 0) {
              sAppliedSubs = " [" + p.applied_sub_services.join(", ") + "]";
            }
            sDesc = "\u2705 " + oBundle.getText("wizAlreadyApplied", [dApplied.toLocaleDateString("tr-TR")]) + sAppliedSubs;
          }

          var oItem = new StandardListItem({
            title: p.name + " (" + p.code + ")",
            description: sDesc,
            icon: p.already_applied ? "sap-icon://accept" : "sap-icon://shipping-status",
            type: p.already_applied ? "Inactive" : "Active",
            highlight: p.already_applied ? "Success" : "None"
          });
          oItem.data("provider", p);
          oProviderList.addItem(oItem);
        });
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    _updateSubServiceSelection: function (oWizModel, oSubBox) {
      var aSelected = [];
      oSubBox.getItems().forEach(function (oItem) {
        if (oItem instanceof CheckBox && oItem.getSelected()) {
          aSelected.push(oItem.data("code"));
        }
      });
      oWizModel.setProperty("/selectedSubServices", aSelected);
    },

    _loadPreview: function (oWizModel, oPreviewBox, oBundle) {
      oPreviewBox.removeAllItems();
      var oProvider = oWizModel.getProperty("/selectedProvider");
      if (!oProvider) return;

      var sUrl = "/api/v1/config/wizard/preview?provider=" + oProvider.code;
      var aSubs = oWizModel.getProperty("/selectedSubServices") || [];
      if (aSubs.length > 0) {
        sUrl += "&sub_services=" + aSubs.join(",");
      }

      oPreviewBox.addItem(new BusyIndicator({ size: "32px" }));

      API.get(sUrl).then(function (res) {
        oPreviewBox.removeAllItems();
        var c = res.counts || {};

        oPreviewBox.addItem(new Title({ text: oProvider.name + " — " + oBundle.getText("wizStep2") }).addStyleClass("sapUiSmallMarginBottom"));

        // Counts
        var aLines = [
          { label: oBundle.getText("wizProcessTypes", [c.process_types || 0]), icon: "sap-icon://process" },
          { label: oBundle.getText("wizWarehouses", [c.warehouses || 0]), icon: "sap-icon://factory" },
          { label: oBundle.getText("wizProcessConfigs", [c.process_configs || 0]), icon: "sap-icon://settings" },
          { label: oBundle.getText("wizFieldMappings", [c.field_mappings || 0]), icon: "sap-icon://connected" },
          { label: oBundle.getText("wizMovementMappings", [c.movement_mappings || 0]), icon: "sap-icon://move" }
        ];

        aLines.forEach(function (line) {
          oPreviewBox.addItem(new HBox({ items: [
            new sap.ui.core.Icon({ src: line.icon, size: "1rem" }).addStyleClass("sapUiSmallMarginEnd"),
            new Text({ text: line.label })
          ] }).addStyleClass("sapUiTinyMarginBottom"));
        });

        // Security warning
        oPreviewBox.addItem(new MessageStrip({
          text: oBundle.getText("wizSecurityWarning"),
          type: "Warning",
          showIcon: true
        }).addStyleClass("sapUiSmallMarginTop"));

      }).catch(function () {
        oPreviewBox.removeAllItems();
        oPreviewBox.addItem(new MessageStrip({ text: oBundle.getText("wizApplyError"), type: "Error", showIcon: true }));
      });
    },

    _applyWizard: function (sTenantId, oWizModel, oResultBox, oApplyBtn, oBundle) {
      var oProvider = oWizModel.getProperty("/selectedProvider");
      if (!oProvider) return;

      oApplyBtn.setEnabled(false);
      oApplyBtn.setBusy(true);
      oResultBox.removeAllItems();

      var oPayload = {
        tenant_id: sTenantId,
        provider_code: oProvider.code,
        sub_services: oWizModel.getProperty("/selectedSubServices") || []
      };

      var that = this;
      // Wizard ve dialog referanslarını bul (step kilitleme için)
      var oWizard = oApplyBtn.getParent();
      while (oWizard && !(oWizard instanceof Wizard)) { oWizard = oWizard.getParent(); }

      API.post("/api/v1/config/wizard/apply", oPayload).then(function (res) {
        oApplyBtn.setBusy(false);
        if (res.error) {
          oApplyBtn.setEnabled(true);
          oResultBox.addItem(new MessageStrip({ text: res.error, type: "Error", showIcon: true }));
          return;
        }

        // Success
        var c = res.counts || {};
        var total = Object.values(c).reduce(function (a, b) { return a + b; }, 0);

        oResultBox.addItem(new MessageStrip({
          text: oBundle.getText("wizApplySuccess") + " — " + oBundle.getText("wizResultSummary", [total]),
          type: "Success",
          showIcon: true
        }).addStyleClass("sapUiSmallMarginBottom"));

        // Detail counts
        var aDetails = [
          { label: oBundle.getText("wizProcessTypes", [c.process_types || 0]) },
          { label: oBundle.getText("wizWarehouses", [c.warehouses || 0]) },
          { label: oBundle.getText("wizProcessConfigs", [c.process_configs || 0]) },
          { label: oBundle.getText("wizFieldMappings", [c.field_mappings || 0]) },
          { label: oBundle.getText("wizMovementMappings", [c.movement_mappings || 0]) }
        ];
        aDetails.forEach(function (d) {
          oResultBox.addItem(new Text({ text: "  \u2713 " + d.label }));
        });

        // Reminder
        oResultBox.addItem(new MessageStrip({
          text: oBundle.getText("wizReminder"),
          type: "Information",
          showIcon: true
        }).addStyleClass("sapUiSmallMarginTop"));

        // Uygula butonunu gizle — tekrar tıklanmasın
        oApplyBtn.setVisible(false);

        // Wizard adımlarını ve tüm interaktif elementleri kilitle
        if (oWizard) {
          oWizard.setShowNextButton(false);
          oWizard.getSteps().forEach(function (oStep) {
            oStep.setValidated(false);
          });
          // Tüm interaktif kontrolleri devre dışı bırak
          that._disableAllControls(oWizard);
        }

        // Dialog İptal butonunu gizle, "Gözden Geçir ve Kapat" ekle
        var oDialog = oApplyBtn.getParent();
        while (oDialog && !(oDialog instanceof Dialog)) { oDialog = oDialog.getParent(); }
        if (oDialog) {
          var oEndBtn = oDialog.getEndButton();
          if (oEndBtn) oEndBtn.setVisible(false);
        }

        var oCloseBtn = new Button({
          text: oBundle.getText("wizReviewClose"),
          type: "Emphasized",
          icon: "sap-icon://accept",
          press: function () {
            var oDlg = oCloseBtn.getParent();
            while (oDlg && !oDlg.close) { oDlg = oDlg.getParent(); }
            if (oDlg && oDlg.close) { oDlg.close(); }
          }
        }).addStyleClass("sapUiSmallMarginTop");
        oResultBox.addItem(oCloseBtn);

        that._loadData();
      }).catch(function (err) {
        oApplyBtn.setBusy(false);
        oApplyBtn.setEnabled(true);
        oResultBox.addItem(new MessageStrip({
          text: oBundle.getText("wizApplyError") + ": " + (err.message || err),
          type: "Error",
          showIcon: true
        }));
      });
    },

    _disableAllControls: function (oParent) {
      var that = this;
      var aAggregations = ["items", "content", "steps"];
      aAggregations.forEach(function (sAgg) {
        var aChildren = [];
        try { aChildren = oParent.getAggregation(sAgg) || []; } catch (_) { /* ignore */ }
        if (!Array.isArray(aChildren)) aChildren = [aChildren];
        aChildren.forEach(function (oChild) {
          if (oChild.setEnabled) oChild.setEnabled(false);
          if (oChild.setMode) oChild.setMode("None");
          that._disableAllControls(oChild);
        });
      });
    }
  });
});

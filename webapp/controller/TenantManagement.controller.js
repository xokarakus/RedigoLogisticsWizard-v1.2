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
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Button, Label, Input,
             Select, TextArea, Title, Item, SimpleForm, API) {
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
        placeholder: "\u00d6rn: TESLA",
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
      var oAdminUserInput = new Input({ value: "", placeholder: "admin" });
      var oAdminEmailInput = new Input({ value: "", placeholder: "admin@firma.com", type: "Email" });

      // ── Form yapısı (screenshot'a uygun gruplar) ──
      var aContent = [
        new Title({ text: oBundle.getText("tmCode") }),
        new Label({ text: oBundle.getText("tmCode"), required: !bEdit }), oCodeInput,
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

            if (!sName || (!bEdit && !sCode) || !sDomain) {
              MessageToast.show(oBundle.getText("msgRequiredFields"));
              return;
            }

            var oPayload = {
              code: sCode,
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
                MessageToast.show(res.error);
                return;
              }
              MessageToast.show(oBundle.getText("msgSaved"));
              oDialog.close();
              that._loadData();
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
    }
  });
});

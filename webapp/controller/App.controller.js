sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/mvc/XMLView",
  "sap/m/MessageToast",
  "sap/m/Page",
  "sap/m/Text",
  "sap/m/StandardListItem",
  "sap/m/SelectDialog",
  "sap/ui/model/json/JSONModel",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, XMLView, MessageToast, Page, Text, StandardListItem, SelectDialog, JSONModel, API) {
  "use strict";

  var VIEW_MAP = {
    dashboard: "com.redigo.logistics.cockpit.view.Dashboard",
    workOrders: "com.redigo.logistics.cockpit.view.WorkOrders",
    workOrderDetail: "com.redigo.logistics.cockpit.view.WorkOrderDetail",
    inventory: "com.redigo.logistics.cockpit.view.Inventory",
    transactionLog: "com.redigo.logistics.cockpit.view.TransactionLog",
    reconciliation: "com.redigo.logistics.cockpit.view.Reconciliation",
    masterData: "com.redigo.logistics.cockpit.view.MasterData",
    configuration: "com.redigo.logistics.cockpit.view.Configuration",
    administration: "com.redigo.logistics.cockpit.view.Administration",
    tenantManagement: "com.redigo.logistics.cockpit.view.TenantManagement",
    auditLog: "com.redigo.logistics.cockpit.view.AuditLog",
    jobManagement: "com.redigo.logistics.cockpit.view.JobManagement",
    dlq: "com.redigo.logistics.cockpit.view.DeadLetterQueue"
  };

  return Controller.extend("com.redigo.logistics.cockpit.controller.App", {

    onInit: function () {
      this._viewCache = {};

      // RBAC: JWT token'dan kullanici bilgisi
      var oUser = API.getUser() || {};
      var sRole = oUser.role || "";
      var bSuperAdmin = oUser.is_super_admin === true;
      var bCanConfigure = bSuperAdmin || sRole === "TENANT_ADMIN";
      var bImpersonating = oUser.impersonating === true;

      var ROLE_LABELS = {
        SUPER_ADMIN: "S\u00fcper Y\u00f6netici",
        TENANT_ADMIN: "Firma Y\u00f6neticisi",
        TENANT_USER: "Kullan\u0131c\u0131"
      };

      var oAppState = new JSONModel({
        displayName: oUser.display_name || oUser.username || "",
        tenantName: oUser.tenant_name || "",
        role: sRole,
        roleText: ROLE_LABELS[sRole] || sRole,
        isSuperAdmin: bSuperAdmin,
        canConfigure: bCanConfigure,
        theme: localStorage.getItem("redigo_theme") || "auto",
        // Impersonation
        isImpersonating: bImpersonating,
        impersonatingTenant: bImpersonating ? oUser.tenant_name : "",
        originalTenantCode: oUser.original_tenant_code || "",
        // Side navigation
        sideExpanded: true,
        // Permissions (varsayilanlar, API'den guncellenecek)
        perm: {
          dashboard_view: true,
          work_orders_view: true,
          work_orders_process: bCanConfigure,
          inventory_view: true,
          reconciliation_view: true,
          reconciliation_run: bCanConfigure,
          config_view: bCanConfigure,
          config_edit: bCanConfigure,
          users_view: bCanConfigure,
          users_manage: bCanConfigure,
          audit_view: bCanConfigure,
          tenants_manage: bSuperAdmin
        }
      });
      this.getView().setModel(oAppState, "appState");

      // DB'den gercek yetkileri yukle
      var that = this;
      API.get("/api/auth/my-permissions").then(function (res) {
        if (res.data) {
          var p = res.data;
          var oPerm = {};
          Object.keys(p).forEach(function (k) {
            oPerm[k.replace(/\./g, "_")] = p[k];
          });
          oAppState.setProperty("/perm", oPerm);
          // canConfigure'i da guncelle
          oAppState.setProperty("/canConfigure", oPerm.config_view || oPerm.users_view || oPerm.audit_view);
        }
      });

      // Session monitoring baslat
      API.startSessionMonitor();

      // Restore last page on reload, fallback to dashboard
      var sLastPage = localStorage.getItem("redigo_current_page");
      if (sLastPage && VIEW_MAP[sLastPage] && sLastPage !== "workOrderDetail") {
        this._showView(sLastPage);
      } else {
        this._showView("dashboard");
      }
    },

    /* ── Navigation ── */

    _showView: function (sKey) {
      var oNavContainer = this.byId("navContainer");
      var that = this;

      // Persist current page for reload
      if (sKey !== "workOrderDetail") {
        localStorage.setItem("redigo_current_page", sKey);
      }

      if (this._viewCache[sKey]) {
        var oCached = this._viewCache[sKey];
        oNavContainer.to(oCached.getId());
        if (oCached.getController && oCached.getController() && oCached.getController()._onBeforeShow) {
          oCached.getController()._onBeforeShow();
        }
        return;
      }

      var sViewName = VIEW_MAP[sKey];
      if (!sViewName) { return; }

      var oComponent = this.getOwnerComponent();
      var oPromise = oComponent.runAsOwner(function () {
        return XMLView.create({ viewName: sViewName });
      });

      oPromise.then(function (oView) {
        that._viewCache[sKey] = oView;
        oNavContainer.addPage(oView);
        oNavContainer.to(oView.getId());
      }).catch(function (err) {
        var sMsg = err.message || String(err);
        console.error("View load FAILED: " + sViewName, err);
        var oBundle = that.getView().getModel("i18n").getResourceBundle();
        var sErrTitle = oBundle.getText("msgError") + ": " + sKey;
        var sErrText = oBundle.getText("msgViewLoadError", [sViewName, sMsg]);
        var oErrPage = new Page({
          title: sErrTitle,
          content: [
            new Text({ text: sErrText }).addStyleClass("sapUiSmallMargin")
          ]
        });
        that._viewCache[sKey] = oErrPage;
        oNavContainer.addPage(oErrPage);
        oNavContainer.to(oErrPage.getId());
      });
    },

    onNavSelect: function (oEvent) {
      var oItem = oEvent.getParameter("item");
      if (!oItem) { return; }
      var sKey = oItem.getKey();

      // Logout ozel islemi
      if (sKey === "_logout") {
        this.onLogout();
        return;
      }

      if (sKey) {
        this._showView(sKey);
      }
    },

    onMenuToggle: function () {
      var oToolPage = this.byId("toolPage");
      oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
    },

    /* ── Theme ── */

    onThemeChange: function (oEvent) {
      var sKey = oEvent.getParameter("selectedItem").getKey();
      localStorage.setItem("redigo_theme", sKey);
      var sTheme = sKey === "dark" ? "sap_horizon_dark"
        : sKey === "light" ? "sap_horizon"
        : window.matchMedia("(prefers-color-scheme: dark)").matches ? "sap_horizon_dark" : "sap_horizon";
      sap.ui.getCore().applyTheme(sTheme);
    },

    /* ── Auth ── */

    onLogout: function () {
      API.stopSessionMonitor();
      localStorage.removeItem("redigo_current_page");
      API.post("/api/auth/logout").finally(function () {
        API.logout();
      });
    },

    /* ── Impersonation ── */

    onSwitchCompany: function () {
      var that = this;
      var oBundle = this.getView().getModel("i18n").getResourceBundle();

      API.get("/api/auth/tenants").then(function (res) {
        var aTenants = res.data || [];

        if (aTenants.length === 0) {
          MessageToast.show("Hi\u00e7 \u015firket bulunamad\u0131");
          return;
        }

        var oTenantsModel = new JSONModel(aTenants);

        var oDialog = new SelectDialog({
          title: oBundle.getText("switchCompany"),
          items: {
            path: "/",
            template: new StandardListItem({
              title: "{name}",
              description: "{code}",
              icon: "sap-icon://building"
            })
          },
          confirm: function (oEvent) {
            var oItem = oEvent.getParameter("selectedItem");
            if (!oItem) { return; }
            var sTenantId = oItem.getBindingContext().getProperty("id");
            that._doImpersonate(sTenantId);
          },
          search: function (oEvent) {
            var sValue = oEvent.getParameter("value");
            var oFilter = new sap.ui.model.Filter({
              filters: [
                new sap.ui.model.Filter("name", sap.ui.model.FilterOperator.Contains, sValue),
                new sap.ui.model.Filter("code", sap.ui.model.FilterOperator.Contains, sValue)
              ],
              and: false
            });
            oEvent.getSource().getBinding("items").filter([oFilter]);
          }
        });

        oDialog.setModel(oTenantsModel);
        oDialog.open();
      });
    },

    _doImpersonate: function (sTenantId) {
      API.post("/api/auth/impersonate", { tenant_id: sTenantId }).then(function (res) {
        if (res && res.token) {
          API.setToken(res.token);
          MessageToast.show(res.message || "Impersonation aktif");
          location.reload();
        }
      });
    },

    onStopImpersonation: function () {
      API.post("/api/auth/stop-impersonation").then(function (res) {
        if (res && res.token) {
          API.setToken(res.token);
          MessageToast.show(res.message || "Yerine ge\u00e7me sonland\u0131r\u0131ld\u0131");
          location.reload();
        }
      });
    }
  });
});

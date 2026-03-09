sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Select",
  "sap/m/CheckBox",
  "sap/m/TextArea",
  "sap/m/Title",
  "sap/ui/core/Item",
  "sap/ui/layout/form/SimpleForm",
  "sap/m/Button",
  "com/redigo/logistics/cockpit/util/API"
], function (Controller, JSONModel, MessageToast, MessageBox, Dialog, Label, Input,
             Select, CheckBox, TextArea, Title, Item, SimpleForm, Button, API) {
  "use strict";

  var SYSTEM_ROLE_STATES = {
    SUPER_ADMIN: "Error",
    TENANT_ADMIN: "Warning"
  };

  return Controller.extend("com.redigo.logistics.cockpit.controller.Administration", {

    onInit: function () {
      this._oModel = new JSONModel({
        users: [], userCount: 0, tenants: [], currentTenantDomain: "",
        roles: [], roleCount: 0,
        selectedRole: null, selectedRoleName: "", selectedRoleCode: "",
        selectedRoleIsSystem: false,
        permissionRows: [],
        _permDefs: null
      });
      this.getView().setModel(this._oModel, "admin");
      this._loadData();
    },

    _getText: function (sKey, aArgs) {
      return this.getView().getModel("i18n").getResourceBundle().getText(sKey, aArgs);
    },

    _loadData: function () {
      var that = this;

      // Users
      API.get("/api/auth/users").then(function (res) {
        var users = (res.data || []).map(function (u) {
          u._roleState = SYSTEM_ROLE_STATES[u.role] || "Success";
          u._roleName = u.role;
          u._lastLoginFormatted = u.last_login_at
            ? new Date(u.last_login_at).toLocaleString("tr-TR") : "-";
          return u;
        });
        that._oModel.setProperty("/users", users);
        that._oModel.setProperty("/userCount", users.length);

        // Role name'leri user listesine isle
        that._enrichUserRoleNames();
      });

      // Tenant listesi (SUPER_ADMIN)
      var user = API.getUser();
      if (user && user.role === "SUPER_ADMIN") {
        API.get("/api/auth/tenants").then(function (res) {
          that._oModel.setProperty("/tenants", res.data || []);
        });
      }
      if (user && user.tenant_domain) {
        that._oModel.setProperty("/currentTenantDomain", user.tenant_domain);
      }

      // Roles + permission definitions
      Promise.all([
        API.get("/api/auth/roles"),
        API.get("/api/auth/permissions/definitions")
      ]).then(function (results) {
        var roles = results[0].data || [];
        var defs = results[1];

        // Rol basina kullanici sayisi
        var users = that._oModel.getProperty("/users") || [];
        roles.forEach(function (r) {
          r._userCount = users.filter(function (u) { return u.role === r.code; }).length;
        });
        // Siralama: SUPER_ADMIN, TENANT_ADMIN, TENANT_USER, sonra ozel roller
        var order = { SUPER_ADMIN: 0, TENANT_ADMIN: 1, TENANT_USER: 2 };
        roles.sort(function (a, b) {
          var oa = order[a.code] !== undefined ? order[a.code] : 3;
          var ob = order[b.code] !== undefined ? order[b.code] : 3;
          return oa - ob;
        });

        that._oModel.setProperty("/roles", roles);
        that._oModel.setProperty("/roleCount", roles.length);
        that._oModel.setProperty("/_permDefs", defs);
        that._enrichUserRoleNames();
      });
    },

    _enrichUserRoleNames: function () {
      var roles = this._oModel.getProperty("/roles") || [];
      var users = this._oModel.getProperty("/users") || [];
      if (!roles.length || !users.length) return;
      var roleMap = {};
      roles.forEach(function (r) { roleMap[r.code] = r.name; });
      users.forEach(function (u) {
        u._roleName = roleMap[u.role] || u.role;
      });
      this._oModel.setProperty("/users", users);
    },

    onRefresh: function () {
      this._loadData();
      MessageToast.show(this._getText("msgRefreshed"));
    },

    /* ══════════════════════════════════════
       Kullanici Yonetimi
       ══════════════════════════════════════ */

    onAddUser: function () { this._openUserDialog(null); },

    onEditUser: function (oEvent) {
      var oUser = oEvent.getSource().getBindingContext("admin").getObject();
      this._openUserDialog(oUser);
    },

    _openUserDialog: function (oUser) {
      var bEdit = !!oUser;
      var that = this;
      var currentUser = API.getUser() || {};
      var bSuperAdmin = currentUser.role === "SUPER_ADMIN";
      var tenants = this._oModel.getProperty("/tenants") || [];
      var roles = this._oModel.getProperty("/roles") || [];

      var oUsernameInput = new Input({ value: bEdit ? oUser.username : "", enabled: !bEdit, placeholder: this._getText("adminUsername") });
      var oDisplayNameInput = new Input({ value: bEdit ? oUser.display_name : "", placeholder: this._getText("adminDisplayName") });
      var oPasswordInput = new Input({ type: "Password", placeholder: this._getText("adminPasswordOptional") });
      var oEmailInput = new Input({ value: bEdit ? (oUser.email || "") : "", placeholder: this._getText("adminEmail"), type: "Email" });

      // Roller: sistem + ozel (SUPER_ADMIN sadece super admin tarafindan atanabilir)
      var aRoleItems = [];
      roles.forEach(function (r) {
        if (r.code === "SUPER_ADMIN" && !bSuperAdmin) return;
        aRoleItems.push(new Item({ key: r.code, text: r.name }));
      });
      var oRoleSelect = new Select({ selectedKey: bEdit ? oUser.role : "TENANT_USER", items: aRoleItems });

      var oActiveCheck = new CheckBox({ selected: bEdit ? oUser.is_active : true, text: this._getText("cfgActive") });

      var oForm = new SimpleForm({
        editable: true,
        content: [
          new Label({ text: this._getText("adminUsername"), required: true }), oUsernameInput,
          new Label({ text: this._getText("adminEmail") }), oEmailInput,
          new Label({ text: this._getText("adminDisplayName") }), oDisplayNameInput,
          new Label({ text: this._getText("loginPassword") }), oPasswordInput,
          new Label({ text: this._getText("adminRole") }), oRoleSelect,
          new Label({ text: "" }), oActiveCheck
        ]
      });

      var oTenantSelect = null;
      if (bSuperAdmin && tenants.length > 0) {
        oTenantSelect = new Select({
          selectedKey: bEdit ? oUser.tenant_id : (currentUser.tenant_id || ""),
          items: tenants.map(function (t) { return new Item({ key: t.id, text: t.code + " - " + t.name }); })
        });
        oForm.insertContent(new Label({ text: this._getText("adminTenant") }), 8);
        oForm.insertContent(oTenantSelect, 9);
      }

      var oDialog = new Dialog({
        title: bEdit ? this._getText("adminEditUser") : this._getText("adminAddUser"),
        contentWidth: "420px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"), type: "Emphasized",
          press: function () {
            var sUsername = oUsernameInput.getValue().trim();
            var sPassword = oPasswordInput.getValue();
            if (!sUsername) { MessageToast.show(that._getText("msgRequiredFields")); return; }
            if (sPassword && sPassword.length < 6) { MessageToast.show(that._getText("adminPasswordMinLength")); return; }

            var sEmail = oEmailInput.getValue().trim();
            // E-posta domain dogrulamasi
            if (sEmail) {
              var sExpectedDomain = "";
              if (oTenantSelect) {
                var sSelTenantId = oTenantSelect.getSelectedKey();
                var aTenants = that._oModel.getProperty("/tenants") || [];
                var oSelTenant = aTenants.find(function (t) { return String(t.id) === String(sSelTenantId); });
                sExpectedDomain = oSelTenant ? (oSelTenant.domain || "") : "";
              } else {
                sExpectedDomain = that._oModel.getProperty("/currentTenantDomain") || "";
              }
              if (sExpectedDomain) {
                var sEmailDomain = sEmail.split("@")[1] || "";
                if (sEmailDomain.toLowerCase() !== sExpectedDomain.toLowerCase()) {
                  MessageBox.error(that._getText("adminEmailDomainError", [sExpectedDomain]));
                  return;
                }
              }
            }

            var oPayload = {
              display_name: oDisplayNameInput.getValue().trim() || sUsername,
              email: sEmail || undefined,
              role: oRoleSelect.getSelectedKey(),
              is_active: oActiveCheck.getSelected()
            };
            if (oTenantSelect) oPayload.tenant_id = oTenantSelect.getSelectedKey();

            if (bEdit) {
              if (sPassword) oPayload.password = sPassword;
              API.put("/api/auth/users/" + oUser.id, oPayload).then(function (res) {
                if (res.error) return;
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                oDialog.close();
              });
            } else {
              oPayload.username = sUsername;
              if (sPassword) oPayload.password = sPassword;
              API.post("/api/auth/users", oPayload).then(function (res) {
                if (res.error) return;
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                oDialog.close();
              });
            }
          }
        }),
        endButton: new Button({ text: this._getText("cfgCancel"), press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onResetPassword: function (oEvent) {
      var oUser = oEvent.getSource().getBindingContext("admin").getObject();
      if (!oUser.email) {
        MessageBox.warning(this._getText("adminNoEmailForReset"));
        return;
      }
      MessageBox.confirm(this._getText("adminResetEmailConfirm", [oUser.email]), {
        title: this._getText("adminResetPassword"),
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) return;
          API.post("/api/auth/send-reset", { user_id: oUser.id }).then(function (res) {
            if (res.error) { MessageBox.error(res.error); return; }
            MessageToast.show(res.message || "OK");
          });
        }
      });
    },

    /* ══════════════════════════════════════
       Rol Yonetimi
       ══════════════════════════════════════ */

    onSelectRole: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      var oRole = oItem.getBindingContext("admin").getObject();
      this._oModel.setProperty("/selectedRole", oRole);
      this._oModel.setProperty("/selectedRoleName", oRole.name + " (" + oRole.code + ")");
      this._oModel.setProperty("/selectedRoleCode", oRole.code);
      this._oModel.setProperty("/selectedRoleIsSystem", oRole.is_system);
      this._buildPermissionRows(oRole);
    },

    _buildPermissionRows: function (oRole) {
      var defs = this._oModel.getProperty("/_permDefs");
      if (!defs || !defs.permissions) return;

      var rolePerms = oRole.permissions || {};
      var bIsTenantAdmin = oRole.code === "TENANT_ADMIN";
      var aRows = [];
      var sLastGroup = "";

      defs.permissions.forEach(function (p) {
        if (p.key === "tenants.manage") return;
        if (p.group !== sLastGroup) {
          sLastGroup = p.group;
          var grp = defs.groups.find(function (g) { return g.key === p.group; });
          aRows.push({
            isGroupHeader: true,
            groupLabel: grp ? grp.label_tr : p.group,
            label: "", key: "", granted: false, locked: false
          });
        }
        var bLocked = bIsTenantAdmin && (p.key === "users.view" || p.key === "users.manage");
        aRows.push({
          isGroupHeader: false,
          groupLabel: "",
          label: p.label_tr,
          key: p.key,
          granted: bLocked ? true : (rolePerms[p.key] === true),
          locked: bLocked
        });
      });

      this._oModel.setProperty("/permissionRows", aRows);
    },

    onAddRole: function () {
      this._openRoleDialog(null);
    },

    onEditRole: function () {
      var oRole = this._oModel.getProperty("/selectedRole");
      if (!oRole) return;
      this._openRoleDialog(oRole);
    },

    _openRoleDialog: function (oRole) {
      var bEdit = !!oRole;
      var that = this;

      var oCodeInput = new Input({
        value: bEdit ? oRole.code : "",
        enabled: !bEdit,
        placeholder: "DEPOCU",
        maxLength: 30
      });
      var oNameInput = new Input({
        value: bEdit ? oRole.name : "",
        placeholder: this._getText("roleName")
      });
      var oDescInput = new TextArea({
        value: bEdit ? (oRole.description || "") : "",
        rows: 2, width: "100%",
        placeholder: this._getText("roleDescription")
      });

      var oDialog = new Dialog({
        title: bEdit ? this._getText("roleEdit") : this._getText("roleAdd"),
        contentWidth: "400px",
        content: [
          new SimpleForm({
            editable: true,
            content: [
              new Label({ text: this._getText("roleCode"), required: !bEdit }), oCodeInput,
              new Label({ text: this._getText("roleName"), required: true }), oNameInput,
              new Label({ text: this._getText("roleDescription") }), oDescInput
            ]
          })
        ],
        beginButton: new Button({
          text: this._getText("cfgSave"), type: "Emphasized",
          press: function () {
            var sCode = oCodeInput.getValue().trim().toUpperCase();
            var sName = oNameInput.getValue().trim();
            if (!sName || (!bEdit && !sCode)) {
              MessageToast.show(that._getText("msgRequiredFields"));
              return;
            }
            var oPayload = { code: sCode, name: sName, description: oDescInput.getValue().trim() };

            if (bEdit) {
              API.put("/api/auth/roles/" + oRole.id, oPayload).then(function (res) {
                if (res.error) { MessageBox.error(res.error); return; }
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                oDialog.close();
              });
            } else {
              API.post("/api/auth/roles", oPayload).then(function (res) {
                if (res.error) { MessageBox.error(res.error); return; }
                MessageToast.show(that._getText("msgSaved"));
                that._loadData();
                oDialog.close();
              });
            }
          }
        }),
        endButton: new Button({ text: this._getText("cfgCancel"), press: function () { oDialog.close(); } }),
        afterClose: function () { oDialog.destroy(); }
      });
      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onDeleteRole: function () {
      var oRole = this._oModel.getProperty("/selectedRole");
      if (!oRole || oRole.is_system) return;
      var that = this;

      MessageBox.confirm(
        this._getText("msgConfirmDelete") + "\n\n" + oRole.code + " - " + oRole.name,
        {
          title: this._getText("msgConfirmDeleteTitle"),
          onClose: function (sAction) {
            if (sAction !== MessageBox.Action.OK) return;
            API.del("/api/auth/roles/" + oRole.id).then(function (res) {
              if (res.error) { MessageBox.error(res.error); return; }
              MessageToast.show(that._getText("msgDeleted"));
              that._oModel.setProperty("/selectedRole", null);
              that._loadData();
            });
          }
        }
      );
    },

    onSavePermissions: function () {
      var oRole = this._oModel.getProperty("/selectedRole");
      if (!oRole || oRole.code === "SUPER_ADMIN") return;
      var that = this;

      var aRows = this._oModel.getProperty("/permissionRows") || [];
      var oPerms = {};
      aRows.forEach(function (row) {
        if (!row.isGroupHeader && row.key) {
          oPerms[row.key] = row.granted;
        }
      });
      oPerms["tenants.manage"] = false;

      API.put("/api/auth/roles/" + oRole.id, { permissions: oPerms }).then(function (res) {
        if (res.error) { MessageBox.error(res.error); return; }
        MessageToast.show(that._getText("msgSaved"));
        // Local cache guncelle
        oRole.permissions = oPerms;
        that._oModel.setProperty("/selectedRole", oRole);
      });
    }
  });
});

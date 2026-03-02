sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Select",
  "sap/m/TextArea",
  "sap/m/CheckBox",
  "sap/ui/core/Item",
  "sap/ui/layout/form/SimpleForm",
  "com/redigo/logistics/cockpit/util/API"
], function (MessageToast, MessageBox, Dialog, Button, Label, Input, Select, TextArea, CheckBox, Item, SimpleForm, API) {
  "use strict";

  return {

    /* ═══════════════════════════════════════════
       Alan Eşleştirmeleri (Field Mappings) – Profil CRUD
       ═══════════════════════════════════════════ */

    onSearchFieldMapping: function (oEvent) {
      var sQuery = (oEvent.getParameter("newValue") || oEvent.getParameter("query") || "").toLowerCase().trim();
      var aAll = this._oModel.getProperty("/fieldMappings") || [];

      if (!sQuery) {
        this._oModel.setProperty("/fieldMappingsFiltered", aAll);
        return;
      }

      var aFiltered = aAll.filter(function (o) {
        return (o.company_code || "").toLowerCase().indexOf(sQuery) >= 0
          || (o.description || "").toLowerCase().indexOf(sQuery) >= 0
          || (o.direction || "").toLowerCase().indexOf(sQuery) >= 0
          || (o.process_type || "").toLowerCase().indexOf(sQuery) >= 0
          || (o.category || "").toLowerCase().indexOf(sQuery) >= 0
          || (o.http_method || "").toLowerCase().indexOf(sQuery) >= 0;
      });
      this._oModel.setProperty("/fieldMappingsFiltered", aFiltered);
    },

    onSelectFieldMapping: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      if (!oItem) return;
      var oProfile = oItem.getBindingContext("cfg").getObject();
      this._oModel.setProperty("/selectedFM", oProfile.id);
      this._oModel.setProperty("/selectedFMTitle", oProfile.process_type + " \u2013 " + oProfile.company_code + " \u2013 " + oProfile.description);
      this._oModel.setProperty("/selectedFMDirection", oProfile.direction || "SAP_TO_3PL");
      this._oModel.setProperty("/selectedFMCategory", oProfile.category || "WORK_ORDER");
      this._oModel.setProperty("/selectedFMSapJson", JSON.stringify(oProfile.sap_sample_json || {}, null, 2));
      var computed3pl = this._rebuildThreeplJson(oProfile.field_rules || [], oProfile.sap_sample_json || {});
      this._oModel.setProperty("/selectedFM3plJson", JSON.stringify(computed3pl, null, 2));
      this._setFMRules(oProfile.field_rules || []);
      this._oModel.setProperty("/selectedFMHeaders", oProfile.headers || []);
      this._oModel.setProperty("/selectedFMSecurityId", oProfile.security_profile_id || "");
      this._oModel.setProperty("/selectedFMMethod", oProfile.http_method || "POST");
      this._oModel.setProperty("/selectedFMApiEndpoint", oProfile.api_endpoint || "");
      var sSourceApi = oProfile.source_api_endpoint;
      if (!sSourceApi) {
        sSourceApi = this._generateSourceApiPath(oProfile);
        var that2 = this;
        var iIdx = this._oModel.getProperty("/fieldMappings").indexOf(oProfile);
        API.put("/api/config/field-mappings/" + oProfile.id, { source_api_endpoint: sSourceApi }).then(function () {
          if (iIdx >= 0) that2._oModel.setProperty("/fieldMappings/" + iIdx + "/source_api_endpoint", sSourceApi);
        });
      }
      this._oModel.setProperty("/selectedFMSourceApi", sSourceApi);
      this._oModel.setProperty("/selectedFMSourceSecurityId", oProfile.source_security_profile_id || "");
      this._oModel.setProperty("/selectedFMResponseSampleJson",
        JSON.stringify(oProfile.threepl_response_sample_json || {}, null, 2));
      this._oModel.setProperty("/selectedFMResponseRules", oProfile.response_rules || []);
      this._oModel.setProperty("/responsePreviewJson", "");
      this._oModel.setProperty("/testInputJson", "");
      this._oModel.setProperty("/testResponseJson", "");
      this._oModel.setProperty("/testStatus", "");
      this._oModel.setProperty("/testStatusState", "None");
      this._oModel.setProperty("/outputHeaders", "");
      this._oModel.setProperty("/outputJson", "");
      this._oModel.setProperty("/outputSecurity", "");
      var aSec = this._oModel.getProperty("/securityProfiles") || [];
      var sCompany = oProfile.company_code;
      var aFilteredSec = [{ id: "", displayText: this._getText("fmNoSecurity") }];
      aSec.forEach(function (sp) {
        if (sp.company_code === sCompany) {
          aFilteredSec.push({ id: sp.id, displayText: sp.auth_type + " \u2013 " + sp.environment });
        }
      });
      this._oModel.setProperty("/securityForCompany", aFilteredSec);
      var aSourceSec = [{ id: "", displayText: this._getText("fmNoSecurity") }];
      aSec.forEach(function (sp) {
        aSourceSec.push({ id: sp.id, displayText: sp.company_code + " \u2013 " + sp.auth_type + " \u2013 " + sp.environment });
      });
      this._oModel.setProperty("/sourceSecurityProfiles", aSourceSec);
    },

    _openFieldMappingDialog: function (oExisting) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("fmEditProfile") : this._getText("fmAddProfile");

      var aTypes = this._oModel.getProperty("/processTypes") || [];
      var oProcessType = new Select({ selectedKey: bEdit ? oExisting.process_type : "" });
      oProcessType.addItem(new Item({ key: "", text: this._getText("cfgSelectProcessType") }));
      aTypes.forEach(function (t) {
        oProcessType.addItem(new Item({ key: t.code, text: t.code + " \u2013 " + t.name }));
      });
      var oCompany = new Select({ selectedKey: bEdit ? oExisting.company_code : "" });
      var aWhFM = this._oModel.getProperty("/warehouses") || [];
      var seenFM = {};
      aWhFM.forEach(function (w) {
        if (w.company_code && !seenFM[w.company_code]) {
          oCompany.addItem(new Item({ key: w.company_code, text: w.company_code }));
          seenFM[w.company_code] = true;
        }
      });
      if (bEdit && oExisting.company_code && !seenFM[oExisting.company_code]) {
        oCompany.insertItem(new Item({ key: oExisting.company_code, text: oExisting.company_code }), 0);
      }
      var oCategory = new Select({ selectedKey: bEdit ? (oExisting.category || "WORK_ORDER") : "WORK_ORDER" });
      oCategory.addItem(new Item({ key: "WORK_ORDER", text: this._getText("fmCategoryWorkOrder") }));
      oCategory.addItem(new Item({ key: "MASTER_DATA", text: this._getText("fmCategoryMasterData") }));
      var oDesc = new Input({ value: bEdit ? oExisting.description : "" });
      var oSapJson = new TextArea({ rows: 10, width: "100%" });
      oSapJson.setValue(bEdit ? JSON.stringify(oExisting.sap_sample_json || {}, null, 2) : "{}");
      var o3plJson = new TextArea({ rows: 10, width: "100%" });
      o3plJson.setValue(bEdit ? JSON.stringify(oExisting.threepl_sample_json || {}, null, 2) : "{}");

      function fnAutoFillSapJson() {
        var sKey = oProcessType.getSelectedKey();
        if (!sKey) return;
        var oType = aTypes.find(function (t) { return t.code === sKey; });
        if (oType && oType.sap_sample_json && Object.keys(oType.sap_sample_json).length > 0) {
          var sCurrent = oSapJson.getValue().trim();
          if (!sCurrent || sCurrent === "{}" || sCurrent === "{ }") {
            oSapJson.setValue(JSON.stringify(oType.sap_sample_json, null, 2));
          }
        }
      }
      oProcessType.attachChange(fnAutoFillSapJson);

      var oDirection = new Select({ selectedKey: bEdit ? (oExisting.direction || "SAP_TO_3PL") : "SAP_TO_3PL" });
      oDirection.addItem(new Item({ key: "SAP_TO_3PL", text: "SAP \u2192 3PL" }));
      oDirection.addItem(new Item({ key: "3PL_TO_SAP", text: "3PL \u2192 SAP" }));
      var oHttpMethod = new Select({ selectedKey: bEdit ? (oExisting.http_method || "POST") : "POST" });
      oHttpMethod.addItem(new Item({ key: "POST", text: "POST" }));
      oHttpMethod.addItem(new Item({ key: "GET", text: "GET" }));
      oHttpMethod.addItem(new Item({ key: "PUT", text: "PUT" }));
      oHttpMethod.addItem(new Item({ key: "PATCH", text: "PATCH" }));
      var oApiEndpoint = new Input({ value: bEdit ? (oExisting.api_endpoint || "") : "", placeholder: "https://api.example.com/orders" });
      var oActive = new Select({ selectedKey: bEdit ? String(oExisting.is_active) : "true" });
      oActive.addItem(new Item({ key: "true", text: this._getText("cfgActiveYes") }));
      oActive.addItem(new Item({ key: "false", text: this._getText("cfgActiveNo") }));

      var sInitDir = oDirection.getSelectedKey();
      var oLblSapJson = new Label({ text: sInitDir === "3PL_TO_SAP" ? "3PL JSON (Kaynak)" : "SAP JSON (Kaynak)" });
      var oLbl3plJson = new Label({ text: sInitDir === "3PL_TO_SAP" ? "SAP JSON (Hedef)" : "3PL JSON (Hedef)" });
      oDirection.attachChange(function () {
        var sDir = oDirection.getSelectedKey();
        oLblSapJson.setText(sDir === "3PL_TO_SAP" ? "3PL JSON (Kaynak)" : "SAP JSON (Kaynak)");
        oLbl3plJson.setText(sDir === "3PL_TO_SAP" ? "SAP JSON (Hedef)" : "3PL JSON (Hedef)");
      });

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 3, labelSpanL: 3, labelSpanM: 3,
        emptySpanXL: 0, emptySpanL: 0, emptySpanM: 0,
        columnsXL: 1, columnsL: 1, columnsM: 1,
        content: [
          new Label({ text: this._getText("cfgProcessType"), required: true }), oProcessType,
          new Label({ text: this._getText("fmCompanyCode"), required: true }), oCompany,
          new Label({ text: this._getText("fmCategory"), required: true }), oCategory,
          new Label({ text: this._getText("cfgDescription") }), oDesc,
          new Label({ text: this._getText("fmDirection") }), oDirection,
          new Label({ text: this._getText("fmHttpMethod") }), oHttpMethod,
          new Label({ text: this._getText("fmApiEndpoint") }), oApiEndpoint,
          oLblSapJson, oSapJson,
          oLbl3plJson, o3plJson,
          new Label({ text: this._getText("cfgActive") }), oActive
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "650px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sSapRaw = oSapJson.getValue().trim() || "{}";
            var s3plRaw = o3plJson.getValue().trim() || "{}";
            var oSapObj, o3plObj;
            try { oSapObj = JSON.parse(sSapRaw); } catch (e) {
              MessageBox.error(that._getText("fmInvalidSAPJson")); return;
            }
            try { o3plObj = JSON.parse(s3plRaw); } catch (e) {
              MessageBox.error(that._getText("fmInvalid3PLJson")); return;
            }
            var oPayload = {
              process_type: oProcessType.getSelectedKey(),
              company_code: oCompany.getSelectedKey(),
              category: oCategory.getSelectedKey(),
              description: oDesc.getValue().trim(),
              direction: oDirection.getSelectedKey(),
              http_method: oHttpMethod.getSelectedKey(),
              api_endpoint: oApiEndpoint.getValue().trim(),
              sap_sample_json: oSapObj,
              threepl_sample_json: o3plObj,
              is_active: oActive.getSelectedKey() === "true"
            };
            if (bEdit) {
              oPayload.field_rules = oExisting.field_rules || [];
            } else {
              oPayload.field_rules = [];
            }
            if (!oPayload.process_type || !oPayload.company_code || !oPayload.category) {
              MessageBox.error(that._getText("msgRequiredFields")); return;
            }
            var pReq = bEdit
              ? API.put("/api/config/field-mappings/" + oExisting.id, oPayload)
              : API.post("/api/config/field-mappings", oPayload);
            pReq.then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._oModel.setProperty("/selectedFM", null);
                that._oModel.setProperty("/selectedFMRules", []);
                that._loadData();
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddFieldMapping: function () { this._openFieldMappingDialog(null); },

    onEditFieldMapping: function (oEvent) {
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      this._openFieldMappingDialog(oItem);
    },

    onDeleteFieldMapping: function (oEvent) {
      var that = this;
      var oItem = oEvent.getSource().getBindingContext("cfg").getObject();
      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            API.del("/api/config/field-mappings/" + oItem.id).then(function (result) {
              if (result.success) {
                MessageToast.show(that._getText("msgDeleted"));
                that._oModel.setProperty("/selectedFM", null);
                that._oModel.setProperty("/selectedFMRules", []);
                that._loadData();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }
      });
    },

    /* ═══════════════════════════════════════════
       Alan Kuralları (Field Rules) – Profil içi CRUD
       ═══════════════════════════════════════════ */

    _getSelectedFMProfile: function () {
      var sFmId = this._oModel.getProperty("/selectedFM");
      if (!sFmId) return null;
      var aFM = this._oModel.getProperty("/fieldMappings") || [];
      for (var i = 0; i < aFM.length; i++) {
        if (aFM[i].id === sFmId) return { profile: aFM[i], index: i };
      }
      return null;
    },

    _setFMRules: function (aRules) {
      var rules = (aRules || []).map(function (r) {
        return { sap_field: r.sap_field, threepl_field: r.threepl_field, transform: r.transform, required: !!r.required };
      });
      this._oModel.setProperty("/selectedFMRules", rules);
      this._buildSourceTree();
    },

    _buildSourceTree: function () {
      var sDirection = this._oModel.getProperty("/selectedFMDirection") || "SAP_TO_3PL";
      var bSapSource = (sDirection === "SAP_TO_3PL");
      var sSourceRaw = this._oModel.getProperty(bSapSource ? "/selectedFMSapJson" : "/selectedFM3plJson");
      var aRules = this._oModel.getProperty("/selectedFMRules") || [];

      var ruleMap = {};
      aRules.forEach(function (r, idx) {
        var sourceKey = bSapSource ? r.sap_field : r.threepl_field;
        var targetVal = bSapSource ? r.threepl_field : r.sap_field;
        if (sourceKey) ruleMap[sourceKey] = { targetField: targetVal || "", transform: r.transform || "DIRECT", required: !!r.required, _ruleIndex: idx };
      });

      var treeNodes = [];
      if (!sSourceRaw) { this._oModel.setProperty("/fmTreeNodes", treeNodes); return; }

      var data;
      try { data = JSON.parse(sSourceRaw); } catch (e) { this._oModel.setProperty("/fmTreeNodes", treeNodes); return; }
      if (Array.isArray(data) && data.length === 1) data = data[0];

      function fmtSample(val) {
        if (val === null || val === undefined) return "";
        if (typeof val === "object") return JSON.stringify(val).substring(0, 30);
        return String(val).length > 30 ? String(val).substring(0, 27) + "..." : String(val);
      }

      function buildFieldNode(fieldPath, sampleVal) {
        var rule = ruleMap[fieldPath];
        var shortName = fieldPath;
        var lastDot = fieldPath.lastIndexOf(".");
        if (lastDot >= 0) shortName = fieldPath.substring(lastDot + 1);
        return {
          _nodeType: "field",
          _sapField: fieldPath,
          _sapFieldShort: shortName,
          _sample: fmtSample(sampleVal),
          _mapped: !!rule && !!rule.targetField,
          _threepl: rule ? rule.targetField : "",
          _transform: rule ? rule.transform : "DIRECT",
          _required: rule ? !!rule.required : false,
          _ruleIndex: rule ? rule._ruleIndex : -1
        };
      }

      function buildGroupNode(label, childNodes) {
        var mapped = 0;
        var total = 0;
        function countFields(nodes) {
          nodes.forEach(function (n) {
            if (n._nodeType === "field") { total++; if (n._mapped) mapped++; }
            if (n.children) countFields(n.children);
          });
        }
        countFields(childNodes);
        return {
          _nodeType: "group",
          _label: label + " (" + mapped + "/" + total + ")",
          _sapField: "", _sapFieldShort: "", _sample: "",
          _mapped: false, _threepl: "", _transform: "DIRECT", _ruleIndex: -1,
          children: childNodes
        };
      }

      function processObject(obj, prefix) {
        var nodes = [];
        Object.keys(obj).forEach(function (key) {
          var val = obj[key];
          var fieldPath = prefix ? prefix + key : key;

          if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
            var groupLabel = prefix ? prefix + key + "[]" : key + "[]";
            var childNodes = processObject(val[0], groupLabel + ".");
            nodes.push(buildGroupNode(key + "[]", childNodes));
          } else if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            var childNodes2 = processObject(val, fieldPath + ".");
            nodes.push(buildGroupNode(key, childNodes2));
          } else {
            nodes.push(buildFieldNode(fieldPath, val));
          }
        });
        return nodes;
      }

      if (Array.isArray(data)) {
        var sample = data[0];
        if (sample && typeof sample === "object") {
          treeNodes = processObject(sample, "");
        }
      } else if (typeof data === "object") {
        treeNodes = processObject(data, "");
      }

      this._oModel.setProperty("/fmTreeNodes", []);
      this._oModel.setProperty("/fmTreeNodes", treeNodes);
      var oTree = this.byId("fmRulesTree");
      if (oTree) {
        var oBinding = oTree.getBinding("items");
        if (oBinding) oBinding.refresh(true);
      }
    },

    _openFieldRuleDialog: function (oExisting, iIndex, sPreFillSapField) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("fmEditRule") : this._getText("fmAddRule");

      var oSapField = new Input({ value: bEdit ? oExisting.sap_field : (sPreFillSapField || ""), placeholder: "VBELN" });
      var o3plField = new Input({ value: bEdit ? oExisting.threepl_field : "", placeholder: "order_number" });
      var oTransform = new Select({ selectedKey: bEdit ? (oExisting.transform || "DIRECT") : "DIRECT" });
      oTransform.addItem(new Item({ key: "DIRECT", text: this._getText("fmDirectRule") }));
      oTransform.addItem(new Item({ key: "LOOKUP", text: this._getText("fmLookupRule") }));
      oTransform.addItem(new Item({ key: "PREFIX", text: this._getText("fmPrefixRule") }));
      oTransform.addItem(new Item({ key: "SAP_DATE", text: this._getText("fmSapDateRule") }));
      oTransform.addItem(new Item({ key: "TO_NUMBER", text: this._getText("fmToNumberRule") }));
      oTransform.addItem(new Item({ key: "TO_STRING", text: this._getText("fmToStringRule") }));
      var oRequired = new CheckBox({ selected: bEdit ? !!oExisting.required : false });

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        content: [
          new Label({ text: this._getText("fmSAPField"), required: true }), oSapField,
          new Label({ text: this._getText("fm3PLField"), required: true }), o3plField,
          new Label({ text: this._getText("fmTransformRule") }), oTransform,
          new Label({ text: this._getText("fmRequired") }), oRequired
        ]
      });

      var oDialog = new Dialog({
        title: sTitle,
        contentWidth: "450px",
        content: [oForm],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var oRule = {
              sap_field: oSapField.getValue().trim(),
              threepl_field: o3plField.getValue().trim(),
              transform: oTransform.getSelectedKey(),
              required: oRequired.getSelected()
            };
            if (!oRule.sap_field || !oRule.threepl_field) {
              MessageBox.error(that._getText("msgRequiredFields")); return;
            }

            var oFound = that._getSelectedFMProfile();
            if (!oFound) return;
            var aRules = (oFound.profile.field_rules || []).slice();
            if (bEdit) {
              aRules[iIndex] = oRule;
            } else {
              aRules.push(oRule);
            }

            var oCurrentSapJson = oFound.profile.sap_sample_json || {};
            var sSapRaw = that._oModel.getProperty("/selectedFMSapJson");
            if (sSapRaw) {
              try { oCurrentSapJson = JSON.parse(sSapRaw); } catch (_) { /* eski deger */ }
            }

            var new3plJson = that._rebuildThreeplJson(aRules, oCurrentSapJson);
            API.put("/api/config/field-mappings/" + oFound.profile.id, {
              field_rules: aRules,
              sap_sample_json: oCurrentSapJson,
              threepl_sample_json: new3plJson
            }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._setFMRules(aRules);
                that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aRules);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aRules.length);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oCurrentSapJson);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
                oDialog.close();
              } else {
                MessageBox.error(that._getText("msgError"));
              }
            });
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });

      this.getView().addDependent(oDialog);
      oDialog.open();
    },

    onAddFieldRule: function () {
      if (!this._oModel.getProperty("/selectedFM")) return;
      this._openFieldRuleDialog(null, -1);
    },

    onEditFieldRule: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      var iIndex = oNode._ruleIndex;
      if (iIndex < 0) return;
      var aRules = this._oModel.getProperty("/selectedFMRules") || [];
      var oRule = aRules[iIndex];
      if (!oRule) return;
      this._openFieldRuleDialog(oRule, iIndex);
    },

    onDeleteFieldRule: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      var iIndex = oNode._ruleIndex;
      if (iIndex < 0) return;

      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            var oFound = that._getSelectedFMProfile();
            if (!oFound) return;
            var aRules = (oFound.profile.field_rules || []).slice();
            aRules.splice(iIndex, 1);

            var oCurrentSapJson = oFound.profile.sap_sample_json || {};
            var sSapRaw = that._oModel.getProperty("/selectedFMSapJson");
            if (sSapRaw) {
              try { oCurrentSapJson = JSON.parse(sSapRaw); } catch (_) { /* eski deger */ }
            }

            var new3plJson = that._rebuildThreeplJson(aRules, oCurrentSapJson);
            API.put("/api/config/field-mappings/" + oFound.profile.id, {
              field_rules: aRules,
              sap_sample_json: oCurrentSapJson,
              threepl_sample_json: new3plJson
            }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgDeleted"));
                that._setFMRules(aRules);
                that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aRules);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aRules.length);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oCurrentSapJson);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
              }
            });
          }
        }
      });
    },

    /* ═══════════════════════════════════════════
       Inline PO-Tarzi Degisiklik Handler'lari
       ═══════════════════════════════════════════ */

    onTargetFieldChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      if (!oNode || oNode._nodeType !== "field") return;

      var sNewTarget = oEvent.getParameter("value").trim();
      var sSourceField = oNode._sapField;
      var sDirection = this._oModel.getProperty("/selectedFMDirection") || "SAP_TO_3PL";
      var bSapSource = (sDirection === "SAP_TO_3PL");
      var aRules = (this._oModel.getProperty("/selectedFMRules") || []).slice();

      if (oNode._ruleIndex >= 0) {
        if (bSapSource) {
          aRules[oNode._ruleIndex].threepl_field = sNewTarget;
        } else {
          aRules[oNode._ruleIndex].sap_field = sNewTarget;
        }
      } else {
        var newRule = { transform: oNode._transform || "DIRECT" };
        if (bSapSource) {
          newRule.sap_field = sSourceField;
          newRule.threepl_field = sNewTarget;
        } else {
          newRule.threepl_field = sSourceField;
          newRule.sap_field = sNewTarget;
        }
        aRules.push(newRule);
      }
      this._saveRulesAndRefresh(aRules);
    },

    onTransformChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      if (!oNode || oNode._nodeType !== "field") return;

      var sNewTransform = oEvent.getParameter("selectedItem").getKey();
      var sSourceField = oNode._sapField;
      var sDirection = this._oModel.getProperty("/selectedFMDirection") || "SAP_TO_3PL";
      var bSapSource = (sDirection === "SAP_TO_3PL");
      var aRules = (this._oModel.getProperty("/selectedFMRules") || []).slice();

      if (oNode._ruleIndex >= 0) {
        aRules[oNode._ruleIndex].transform = sNewTransform;
      } else {
        var newRule = { transform: sNewTransform };
        if (bSapSource) {
          newRule.sap_field = sSourceField;
          newRule.threepl_field = "";
        } else {
          newRule.threepl_field = sSourceField;
          newRule.sap_field = "";
        }
        aRules.push(newRule);
      }
      this._saveRulesAndRefresh(aRules);
    },

    onSampleValueChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oNode = oCtx.getObject();
      if (!oNode || oNode._nodeType !== "field") return;

      var sNewValue = oEvent.getParameter("value");
      var sDirection = this._oModel.getProperty("/selectedFMDirection") || "SAP_TO_3PL";
      var bSapSource = (sDirection === "SAP_TO_3PL");
      var sSourceProp = bSapSource ? "/selectedFMSapJson" : "/selectedFM3plJson";
      var sSourceRaw = this._oModel.getProperty(sSourceProp);
      try {
        var oSourceJson = JSON.parse(sSourceRaw);
        this._setJsonPath(oSourceJson, oNode._sapField, sNewValue);
        this._oModel.setProperty(sSourceProp, JSON.stringify(oSourceJson, null, 2));
        if (bSapSource) {
          var aRules = this._oModel.getProperty("/selectedFMRules") || [];
          var new3plJson = this._rebuildThreeplJson(aRules, oSourceJson);
          this._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
        }
      } catch (e) { /* JSON parse hatasi */ }
    },

    _setJsonPath: function (obj, path, value) {
      if (!obj || !path) return;
      var resolved = path.replace(/\[\]/g, "[0]");
      var parts = resolved.split(".");
      var current = obj;

      for (var i = 0; i < parts.length - 1; i++) {
        var part = parts[i];
        var bracketMatch = part.match(/^(.*)\[(\d+)\]$/);
        if (bracketMatch) {
          if (bracketMatch[1]) current = current[bracketMatch[1]];
          if (Array.isArray(current)) current = current[parseInt(bracketMatch[2], 10)];
          else return;
        } else if (Array.isArray(current)) {
          current = current[0] ? current[0][part] : undefined;
        } else {
          current = current[part];
        }
        if (current === undefined || current === null) return;
      }

      var lastPart = parts[parts.length - 1];
      var lastBracket = lastPart.match(/^(.*)\[(\d+)\]$/);
      if (lastBracket) {
        if (lastBracket[1]) current = current[lastBracket[1]];
        if (Array.isArray(current)) current[parseInt(lastBracket[2], 10)] = value;
      } else {
        current[lastPart] = value;
      }
    },

    _saveRulesAndRefresh: function (aRules) {
      var that = this;
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var cleanRules = aRules.map(function (r) {
        return { sap_field: r.sap_field, threepl_field: r.threepl_field, transform: r.transform, required: !!r.required };
      });

      var oCurrentSapJson = oFound.profile.sap_sample_json || {};
      var sSapRaw = this._oModel.getProperty("/selectedFMSapJson");
      if (sSapRaw) {
        try { oCurrentSapJson = JSON.parse(sSapRaw); } catch (_) { /* parse hatasinda eski deger */ }
      }

      var new3plJson = this._rebuildThreeplJson(cleanRules, oCurrentSapJson);
      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        field_rules: cleanRules,
        sap_sample_json: oCurrentSapJson,
        threepl_sample_json: new3plJson
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("msgSaved"));
          that._setFMRules(cleanRules);
          that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", cleanRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", cleanRules.length);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oCurrentSapJson);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
        } else {
          MessageBox.error(result.error || that._getText("msgError"));
        }
      });
    }
  };
});

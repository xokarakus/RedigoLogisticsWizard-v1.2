sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/m/Label",
  "sap/m/Input",
  "sap/m/Select",
  "sap/ui/core/Item",
  "sap/ui/layout/form/SimpleForm",
  "com/redigo/logistics/cockpit/util/API"
], function (MessageToast, MessageBox, Dialog, Button, Label, Input, Select, Item, SimpleForm, API) {
  "use strict";

  return {

    /* ═══════════════════════════════════════════
       Flow Designer – JSON Yardımcıları
       ═══════════════════════════════════════════ */

    _flattenJsonKeys: function (obj, prefix) {
      var keys = [];
      prefix = prefix || "";
      if (!obj || typeof obj !== "object") return keys;

      if (Array.isArray(obj)) {
        if (obj.length > 0 && obj[0] !== null && typeof obj[0] === "object") {
          return this._flattenJsonKeys(obj[0], prefix);
        }
        return keys;
      }

      var self = this;
      Object.keys(obj).forEach(function (k) {
        var fullKey = prefix ? prefix + "." + k : k;
        var val = obj[k];
        if (Array.isArray(val)) {
          if (val.length > 0 && val[0] !== null && typeof val[0] === "object") {
            var nested = self._flattenJsonKeys(val[0], fullKey + "[]");
            keys = keys.concat(nested);
          } else {
            keys.push(fullKey);
          }
        } else if (val !== null && typeof val === "object") {
          var nested2 = self._flattenJsonKeys(val, fullKey);
          keys = keys.concat(nested2);
        } else {
          keys.push(fullKey);
        }
      });
      return keys;
    },

    _resolveJsonPath: function (obj, path) {
      if (!obj || !path) return undefined;
      var resolved = path.replace(/\[\]/g, "[0]");
      var parts = resolved.split(".");
      var current = obj;

      for (var i = 0; i < parts.length; i++) {
        if (current === undefined || current === null) return undefined;
        var part = parts[i];

        var bracketMatch = part.match(/^(.*)\[(\d+)\]$/);
        if (bracketMatch) {
          var key = bracketMatch[1];
          var idx = parseInt(bracketMatch[2], 10);
          if (key) {
            current = current[key];
          }
          if (Array.isArray(current)) {
            current = current[idx];
          } else {
            return undefined;
          }
        } else if (Array.isArray(current)) {
          var numIdx = parseInt(part, 10);
          if (!isNaN(numIdx) && numIdx < current.length) {
            current = current[numIdx];
          } else if (current.length > 0) {
            current = current[0][part];
          } else {
            return undefined;
          }
        } else {
          current = current[part];
        }
      }
      return current;
    },

    _applyTransform: function (sapVal, transform) {
      if (sapVal === undefined || sapVal === null) return "";
      if (transform === "SAP_DATE" && typeof sapVal === "string" && sapVal.length === 8) {
        return sapVal.substr(0, 4) + "-" + sapVal.substr(4, 2) + "-" + sapVal.substr(6, 2);
      }
      if (typeof transform === "string" && transform.indexOf("PREFIX:") === 0) {
        return transform.split(":")[1] + String(sapVal);
      }
      return sapVal;
    },

    _rebuildThreeplJson: function (aRules, sapJson) {
      var self = this;

      if (Array.isArray(sapJson) && sapJson.length === 1) {
        sapJson = sapJson[0];
      }

      var activeRules = aRules.filter(function (r) { return !!r.threepl_field; });

      if (Array.isArray(sapJson)) {
        return sapJson.map(function (item) {
          var row = {};
          activeRules.forEach(function (rule) {
            var sapVal = self._resolveJsonPath(item, rule.sap_field);
            row[rule.threepl_field] = self._applyTransform(sapVal, rule.transform);
          });
          return row;
        });
      }

      var headerRules = [];
      var itemRulesMap = {};

      activeRules.forEach(function (rule) {
        var sapField = rule.sap_field || "";
        var arrayMatch = sapField.match(/^(.+?)\[\]\.(.+)$/);
        if (arrayMatch) {
          var arrPath = arrayMatch[1];
          if (!itemRulesMap[arrPath]) itemRulesMap[arrPath] = [];
          itemRulesMap[arrPath].push({
            sapSubField: arrayMatch[2],
            threepl_field: rule.threepl_field,
            transform: rule.transform
          });
        } else {
          headerRules.push(rule);
        }
      });

      var result = {};

      headerRules.forEach(function (rule) {
        var sapVal = self._resolveJsonPath(sapJson, rule.sap_field);
        result[rule.threepl_field] = self._applyTransform(sapVal, rule.transform);
      });

      var arrPaths = Object.keys(itemRulesMap);
      arrPaths.forEach(function (arrPath) {
        var sapArray = self._resolveJsonPath(sapJson, arrPath);
        if (!Array.isArray(sapArray)) return;

        var rules = itemRulesMap[arrPath];
        var outputKey = arrPath.toLowerCase();

        result[outputKey] = sapArray.map(function (sapItem) {
          var row = {};
          rules.forEach(function (ir) {
            var sapVal = self._resolveJsonPath(sapItem, ir.sapSubField);
            row[ir.threepl_field] = self._applyTransform(sapVal, ir.transform);
          });
          return row;
        });
      });

      return result;
    },

    /* ═══════════════════════════════════════════
       SAP / 3PL JSON Change Handlers
       ═══════════════════════════════════════════ */

    onSapJsonChange: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var sSapRaw = this._oModel.getProperty("/selectedFMSapJson");
      var oSapJson;
      try { oSapJson = JSON.parse(sSapRaw); } catch (_) { return; }
      var that = this;
      oFound.profile.sap_sample_json = oSapJson;
      this._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oSapJson);
      API.put("/api/config/field-mappings/" + oFound.profile.id, { sap_sample_json: oSapJson }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("msgSaved"));
          that._buildSourceTree();
        }
      });
    },

    on3plJsonChange: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var s3plRaw = this._oModel.getProperty("/selectedFM3plJson");
      var o3plJson;
      try { o3plJson = JSON.parse(s3plRaw); } catch (_) { return; }
      var that = this;
      oFound.profile.threepl_sample_json = o3plJson;
      this._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", o3plJson);
      API.put("/api/config/field-mappings/" + oFound.profile.id, { threepl_sample_json: o3plJson }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    /* ═══════════════════════════════════════════
       Alan Çıkarma ve Otomatik Eşleme
       ═══════════════════════════════════════════ */

    onExtractSapFields: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var sSapRaw = this._oModel.getProperty("/selectedFMSapJson");
      var oSapJson;
      try { oSapJson = JSON.parse(sSapRaw); } catch (e) {
        MessageBox.error(this._getText("fmInvalidSAPJson")); return;
      }

      if (Array.isArray(oSapJson) && oSapJson.length === 1) {
        oSapJson = oSapJson[0];
        this._oModel.setProperty("/selectedFMSapJson", JSON.stringify(oSapJson, null, 2));
      }

      var aKeys = this._flattenJsonKeys(oSapJson);
      var aExistingRules = (oFound.profile.field_rules || []).slice();
      var existingSapFields = {};
      aExistingRules.forEach(function (r) { existingSapFields[r.sap_field] = true; });

      var iAdded = 0;
      aKeys.forEach(function (key) {
        if (!existingSapFields[key]) {
          aExistingRules.push({ sap_field: key, threepl_field: "", transform: "DIRECT" });
          iAdded++;
        }
      });

      if (iAdded === 0) {
        MessageToast.show(this._getText("fmNoNewFields"));
        return;
      }

      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        field_rules: aExistingRules,
        sap_sample_json: oSapJson
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("fmFieldsExtracted", [iAdded]));
          that._setFMRules(aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aExistingRules.length);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/sap_sample_json", oSapJson);
        }
      });
    },

    onExtract3plFields: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var s3plRaw = this._oModel.getProperty("/selectedFM3plJson");
      var o3plJson;
      try { o3plJson = JSON.parse(s3plRaw); } catch (e) {
        MessageBox.error(this._getText("fmInvalid3PLJson")); return;
      }

      if (Array.isArray(o3plJson) && o3plJson.length === 1) {
        o3plJson = o3plJson[0];
        this._oModel.setProperty("/selectedFM3plJson", JSON.stringify(o3plJson, null, 2));
      }

      var aKeys = this._flattenJsonKeys(o3plJson);
      var aExistingRules = (oFound.profile.field_rules || []).slice();
      var existing3plFields = {};
      aExistingRules.forEach(function (r) { if (r.threepl_field) existing3plFields[r.threepl_field] = true; });

      var iAdded = 0;
      aKeys.forEach(function (key) {
        if (!existing3plFields[key]) {
          aExistingRules.push({ sap_field: "", threepl_field: key, transform: "DIRECT" });
          iAdded++;
        }
      });

      if (iAdded === 0) {
        MessageToast.show(this._getText("fmNoNewFields"));
        return;
      }

      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        field_rules: aExistingRules,
        threepl_sample_json: o3plJson
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("fmFieldsExtracted", [iAdded]));
          that._setFMRules(aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aExistingRules.length);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", o3plJson);
        }
      });
    },

    onAutoMap: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var that = this;

      API.get("/api/config/sap-field-aliases").then(function (result) {
        var sapAliases = result.data || {};

        var aRules = (oFound.profile.field_rules || []).slice();

        var unmappedSapIndices = [];
        var unmapped3plMap = {};

        aRules.forEach(function (r, i) {
          if (r.sap_field && !r.threepl_field) {
            unmappedSapIndices.push(i);
          }
          if (r.threepl_field && !r.sap_field) {
            unmapped3plMap[r.threepl_field.toLowerCase()] = i;
          }
        });

        if (unmappedSapIndices.length === 0) {
          MessageToast.show(that._getText("fmAllMapped"));
          return;
        }

        var iMatched = 0;
        var usedIndices = {};

        unmappedSapIndices.forEach(function (sapIdx) {
          var baseSap = aRules[sapIdx].sap_field.split(".").pop().replace("[]", "");
          var matched3plIdx = -1;

          for (var tField in unmapped3plMap) {
            var idx = unmapped3plMap[tField];
            if (usedIndices[idx]) continue;
            if (tField === baseSap.toLowerCase()) {
              matched3plIdx = idx;
              break;
            }
          }

          if (matched3plIdx < 0 && sapAliases[baseSap]) {
            var aliases = sapAliases[baseSap];
            for (var tField2 in unmapped3plMap) {
              var idx2 = unmapped3plMap[tField2];
              if (usedIndices[idx2]) continue;
              for (var a = 0; a < aliases.length; a++) {
                if (tField2.indexOf(aliases[a]) >= 0) {
                  matched3plIdx = idx2;
                  break;
                }
              }
              if (matched3plIdx >= 0) break;
            }
          }

          if (matched3plIdx >= 0) {
            aRules[sapIdx].threepl_field = aRules[matched3plIdx].threepl_field;
            aRules[matched3plIdx] = null;
            usedIndices[matched3plIdx] = true;
            iMatched++;
          }
        });

        aRules = aRules.filter(function (r) { return r !== null; });

        if (iMatched === 0) {
          MessageToast.show(that._getText("fmNoAutoMatch"));
          return;
        }

        var new3plJson = that._rebuildThreeplJson(aRules, oFound.profile.sap_sample_json || {});
        API.put("/api/config/field-mappings/" + oFound.profile.id, {
          field_rules: aRules,
          threepl_sample_json: new3plJson
        }).then(function (putResult) {
          if (putResult.data && !Array.isArray(putResult.data)) {
            MessageToast.show(that._getText("fmAutoMapped", [iMatched]));
            that._setFMRules(aRules);
            that._oModel.setProperty("/selectedFM3plJson", JSON.stringify(new3plJson, null, 2));
            that._oModel.setProperty("/fieldMappings/" + oFound.index + "/field_rules", aRules);
            that._oModel.setProperty("/fieldMappings/" + oFound.index + "/ruleCount", aRules.length);
            that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_sample_json", new3plJson);
          }
        });
      });
    },

    onFMSecurityChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, { security_profile_id: sKey }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/security_profile_id", sKey);
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    /* ═══════════════════════════════════════════
       HTTP Başlıkları (Headers) CRUD – Profil içi
       ═══════════════════════════════════════════ */

    _openHeaderDialog: function (oExisting, iIndex) {
      var that = this;
      var bEdit = !!oExisting;
      var sTitle = bEdit ? this._getText("fmEditHeader") : this._getText("fmAddHeader");

      var oKey = new Input({ value: bEdit ? oExisting.key : "", placeholder: "Content-Type" });
      var oValue = new Input({ value: bEdit ? oExisting.value : "", placeholder: "application/json" });

      var oForm = new SimpleForm({
        editable: true,
        layout: "ResponsiveGridLayout",
        labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
        content: [
          new Label({ text: this._getText("fmHeaderKey"), required: true }), oKey,
          new Label({ text: this._getText("fmHeaderValue"), required: true }), oValue
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
            var oHeader = {
              key: oKey.getValue().trim(),
              value: oValue.getValue().trim()
            };
            if (!oHeader.key || !oHeader.value) {
              MessageBox.error(that._getText("msgRequiredFields")); return;
            }

            var oFound = that._getSelectedFMProfile();
            if (!oFound) return;
            var aHeaders = (oFound.profile.headers || []).slice();
            if (bEdit) {
              aHeaders[iIndex] = oHeader;
            } else {
              aHeaders.push(oHeader);
            }

            API.put("/api/config/field-mappings/" + oFound.profile.id, { headers: aHeaders }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgSaved"));
                that._oModel.setProperty("/selectedFMHeaders", aHeaders);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/headers", aHeaders);
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

    onAddHeader: function () {
      if (!this._oModel.getProperty("/selectedFM")) return;
      this._openHeaderDialog(null, -1);
    },

    onEditHeader: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var oHeader = oCtx.getObject();
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      this._openHeaderDialog(oHeader, iIndex);
    },

    onDeleteHeader: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);

      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            var oFound = that._getSelectedFMProfile();
            if (!oFound) return;
            var aHeaders = (oFound.profile.headers || []).slice();
            aHeaders.splice(iIndex, 1);

            API.put("/api/config/field-mappings/" + oFound.profile.id, { headers: aHeaders }).then(function (result) {
              if (result.data && !Array.isArray(result.data)) {
                MessageToast.show(that._getText("msgDeleted"));
                that._oModel.setProperty("/selectedFMHeaders", aHeaders);
                that._oModel.setProperty("/fieldMappings/" + oFound.index + "/headers", aHeaders);
              }
            });
          }
        }
      });
    },

    /* ═══════════════════════════════════════════
       Çıktı Önizleme (Output Preview)
       ═══════════════════════════════════════════ */

    onPreviewOutput: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var oProfile = oFound.profile;

      var sapJson = oProfile.sap_sample_json || {};
      var outputObj = this._rebuildThreeplJson(oProfile.field_rules || [], sapJson);
      this._oModel.setProperty("/outputJson", JSON.stringify(outputObj, null, 2));

      var aHeaders = oProfile.headers || [];
      var headerObj = {};
      aHeaders.forEach(function (h) { headerObj[h.key] = h.value; });
      this._oModel.setProperty("/outputHeaders", JSON.stringify(headerObj, null, 2));

      var sSecId = oProfile.security_profile_id;
      if (sSecId) {
        var aSec = this._oModel.getProperty("/securityProfiles") || [];
        var oSec = null;
        for (var i = 0; i < aSec.length; i++) {
          if (aSec[i].id === sSecId) { oSec = aSec[i]; break; }
        }
        if (oSec) {
          var secInfo = { auth_type: oSec.auth_type, environment: oSec.environment };
          if (oSec.auth_type === "OAUTH2") {
            secInfo.token_url = (oSec.config || {}).token_url;
            secInfo.scope = (oSec.config || {}).scope;
          } else if (oSec.auth_type === "API_KEY") {
            secInfo.header_name = (oSec.config || {}).header_name;
            secInfo.api_key = (oSec.config || {}).api_key;
          } else if (oSec.auth_type === "BASIC") {
            secInfo.username = (oSec.config || {}).username;
            secInfo.password = (oSec.config || {}).password;
          } else if (oSec.auth_type === "BEARER") {
            secInfo.token = (oSec.config || {}).token;
          }
          this._oModel.setProperty("/outputSecurity", JSON.stringify(secInfo, null, 2));
        } else {
          this._oModel.setProperty("/outputSecurity", "{}");
        }
      } else {
        this._oModel.setProperty("/outputSecurity", this._getText("fmNoSecurity"));
      }
    },

    /* ═══════════════════════════════════════════
       Entegrasyon – Kaynak/Hedef API + Güvenlik + Test
       ═══════════════════════════════════════════ */

    _generateSourceApiPath: function (oProfile) {
      var sProcess = (oProfile.process_type || "unknown").toLowerCase().replace(/_/g, "-");
      var sCompany = (oProfile.company_code || "default").toLowerCase().replace(/_/g, "-");
      var sBase = "/api/inbound/" + sProcess + "/" + sCompany;
      var aAll = this._oModel.getProperty("/fieldMappings") || [];
      var sCandidate = sBase;
      var iSuffix = 2;
      var sCurrentId = oProfile.id;
      while (aAll.some(function (fm) { return fm.id !== sCurrentId && fm.source_api_endpoint === sCandidate; })) {
        sCandidate = sBase + "-" + iSuffix;
        iSuffix++;
      }
      return sCandidate;
    },

    onCopySourceApi: function () {
      var sUrl = this._oModel.getProperty("/selectedFMSourceApi") || "";
      if (!sUrl) return;
      var sFullUrl = window.location.origin.replace(/:\d+$/, ":3000") + sUrl;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(sFullUrl);
      }
      MessageToast.show(this._getText("fmUrlCopied") + "\n" + sFullUrl);
    },

    onFMSourceSecurityChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, { source_security_profile_id: sKey }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/source_security_profile_id", sKey);
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    onFMMethodChange: function (oEvent) {
      var sKey = oEvent.getSource().getSelectedKey();
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, { http_method: sKey }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/http_method", sKey);
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    onFMApiEndpointChange: function (oEvent) {
      var sVal = oEvent.getSource().getValue().trim();
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, { api_endpoint: sVal }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/api_endpoint", sVal);
          MessageToast.show(that._getText("msgSaved"));
        }
      });
    },

    onTestIntegration: function () {
      var that = this;
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;
      var oProfile = oFound.profile;

      var sEndpoint = this._oModel.getProperty("/selectedFMApiEndpoint");
      var sMethod = this._oModel.getProperty("/selectedFMMethod");
      if (!sEndpoint) {
        MessageBox.error(this._getText("msgRequiredFields"));
        return;
      }

      var sInputRaw = this._oModel.getProperty("/testInputJson");
      if (!sInputRaw || !sInputRaw.trim()) {
        this.onPreviewOutput();
        sInputRaw = this._oModel.getProperty("/outputJson") || "{}";
        this._oModel.setProperty("/testInputJson", sInputRaw);
      }

      var oInputObj;
      try { oInputObj = JSON.parse(sInputRaw); } catch (e) {
        MessageBox.error(this._getText("fmInvalidSAPJson"));
        return;
      }

      var aHeaders = (oProfile.headers || []).filter(function (h) { return h.key && h.value; });

      this._oModel.setProperty("/testStatus", this._getText("fmTestRunning"));
      this._oModel.setProperty("/testStatusState", "Information");
      this._oModel.setProperty("/testResponseJson", "");

      var tStart = Date.now();
      var sStartedAt = new Date().toISOString();

      API.post("/api/config/test-dispatch", {
        url: sEndpoint,
        method: sMethod,
        headers: aHeaders,
        securityProfileId: oProfile.security_profile_id || null,
        body: sMethod !== "GET" ? oInputObj : null,
        responseRules: oProfile.response_rules || []
      })
        .then(function (result) {
          var elapsed = Date.now() - tStart;
          var oDispatch = result.data || {};
          var oResponseParsed = oDispatch.responseBody;
          var sFormatted;
          try { sFormatted = JSON.stringify(oResponseParsed, null, 2); } catch (e) { sFormatted = String(oResponseParsed); }
          var sDisplay = "HTTP " + (oDispatch.statusCode || 0) + " " + (oDispatch.statusText || "") + "\n" +
            "Duration: " + (oDispatch.duration_ms || 0) + " ms\n\n" + sFormatted;
          if (oDispatch.transformedResponse) {
            var sMapped;
            try { sMapped = JSON.stringify(oDispatch.transformedResponse, null, 2); } catch (e2) { sMapped = String(oDispatch.transformedResponse); }
            sDisplay += "\n\n\u2500\u2500 " + that._getText("fmMappedResponse") + " \u2500\u2500\n" + sMapped;
          }
          that._oModel.setProperty("/testResponseJson", sDisplay);
          var bOk = oDispatch.ok;
          if (bOk) {
            that._oModel.setProperty("/testStatus", that._getText("fmTestSuccess", [oDispatch.duration_ms || elapsed]));
            that._oModel.setProperty("/testStatusState", "Success");
          } else {
            that._oModel.setProperty("/testStatus", that._getText("fmTestError", [(oDispatch.statusCode || 0) + " " + (oDispatch.statusText || oDispatch.error || "")]));
            that._oModel.setProperty("/testStatusState", "Error");
          }
          API.post("/api/transactions", {
            direction: "OUTBOUND",
            action: "OUTBOUND_" + oProfile.process_type,
            status: bOk ? "SUCCESS" : "FAILED",
            sap_function: sEndpoint,
            sap_request: oInputObj,
            sap_response: oResponseParsed,
            error_message: bOk ? null : (oDispatch.error || "HTTP " + oDispatch.statusCode),
            retry_count: 0,
            started_at: sStartedAt,
            completed_at: new Date().toISOString(),
            duration_ms: oDispatch.duration_ms || elapsed
          });
        })
        .catch(function (err) {
          var elapsed = Date.now() - tStart;
          that._oModel.setProperty("/testResponseJson", err.toString());
          that._oModel.setProperty("/testStatus", that._getText("fmTestError", [err.message || "Network error"]));
          that._oModel.setProperty("/testStatusState", "Error");
          API.post("/api/transactions", {
            direction: "OUTBOUND",
            action: "OUTBOUND_" + oProfile.process_type,
            status: "FAILED",
            sap_function: sEndpoint,
            sap_request: oInputObj,
            sap_response: null,
            error_message: err.message,
            retry_count: 0,
            started_at: sStartedAt,
            completed_at: new Date().toISOString(),
            duration_ms: elapsed
          });
        });
    },

    /* ═══════════════════════════════════════════
       Yanıt Eşleme (Response Rules) CRUD
       ═══════════════════════════════════════════ */

    _saveResponseRulesAndRefresh: function (aRules) {
      var that = this;
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var cleanRules = aRules.map(function (r) {
        return { source_field: r.source_field, target_field: r.target_field, transform: r.transform };
      });

      var sResponseSample = this._oModel.getProperty("/selectedFMResponseSampleJson");
      var oResponseSample;
      try { oResponseSample = JSON.parse(sResponseSample); } catch (e) { oResponseSample = {}; }
      var oPreview = this._rebuildResponsePreview(cleanRules, oResponseSample);

      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        response_rules: cleanRules
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          that._oModel.setProperty("/selectedFMResponseRules", cleanRules);
          that._oModel.setProperty("/responsePreviewJson", JSON.stringify(oPreview, null, 2));
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/response_rules", cleanRules);
        }
      });
    },

    _rebuildResponsePreview: function (aRules, oResponseSample) {
      if (!oResponseSample || typeof oResponseSample !== "object") return {};
      var validRules = aRules.filter(function (r) { return r.source_field && r.target_field; });
      if (validRules.length === 0) return {};

      var self = this;
      var output = {};
      validRules.forEach(function (rule) {
        var val = self._resolveJsonPath(oResponseSample, rule.source_field);
        if (val !== undefined) {
          output[rule.target_field] = self._applyTransform(val, rule.transform);
        }
      });
      return output;
    },

    onAddResponseRule: function () {
      var that = this;
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var oSourceInput = new Input({ placeholder: "shipment_id" });
      var oTargetInput = new Input({ placeholder: "referans_no" });
      var oTransformSelect = new Select({});
      oTransformSelect.addItem(new Item({ key: "DIRECT", text: "DIRECT" }));
      oTransformSelect.addItem(new Item({ key: "LOOKUP", text: "LOOKUP" }));
      oTransformSelect.addItem(new Item({ key: "PREFIX", text: "PREFIX" }));
      oTransformSelect.addItem(new Item({ key: "SAP_DATE", text: "SAP_DATE" }));

      var oDialog = new Dialog({
        title: this._getText("fmAddResponseRule"),
        contentWidth: "400px",
        content: [
          new SimpleForm({
            editable: true,
            layout: "ResponsiveGridLayout",
            labelSpanXL: 4, labelSpanL: 4, labelSpanM: 4,
            content: [
              new Label({ text: this._getText("fmSourceField"), required: true }), oSourceInput,
              new Label({ text: this._getText("fmTargetField"), required: true }), oTargetInput,
              new Label({ text: this._getText("fmTransform") }), oTransformSelect
            ]
          })
        ],
        beginButton: new Button({
          text: this._getText("cfgSave"),
          type: "Emphasized",
          press: function () {
            var sSource = oSourceInput.getValue().trim();
            var sTarget = oTargetInput.getValue().trim();
            if (!sSource || !sTarget) {
              MessageBox.error(that._getText("msgRequiredFields"));
              return;
            }
            var aRules = (that._oModel.getProperty("/selectedFMResponseRules") || []).slice();
            aRules.push({ source_field: sSource, target_field: sTarget, transform: oTransformSelect.getSelectedKey() });
            that._saveResponseRulesAndRefresh(aRules);
            oDialog.close();
          }
        }),
        endButton: new Button({
          text: this._getText("cfgCancel"),
          press: function () { oDialog.close(); }
        }),
        afterClose: function () { oDialog.destroy(); }
      });
      oDialog.open();
    },

    onDeleteResponseRule: function (oEvent) {
      var that = this;
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      if (!oCtx) return;
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      if (isNaN(iIndex)) return;

      MessageBox.confirm(this._getText("msgConfirmDelete"), {
        title: this._getText("msgConfirmDeleteTitle"),
        onClose: function (sAction) {
          if (sAction === MessageBox.Action.OK) {
            var aRules = (that._oModel.getProperty("/selectedFMResponseRules") || []).slice();
            aRules.splice(iIndex, 1);
            that._saveResponseRulesAndRefresh(aRules);
          }
        }
      });
    },

    onResponseTargetChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      if (!oCtx) return;
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      if (isNaN(iIndex)) return;

      var sNewTarget = oEvent.getParameter("value").trim();
      var aRules = (this._oModel.getProperty("/selectedFMResponseRules") || []).slice();
      if (aRules[iIndex]) {
        aRules[iIndex].target_field = sNewTarget;
        this._saveResponseRulesAndRefresh(aRules);
      }
    },

    onResponseTransformChange: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("cfg");
      if (!oCtx) return;
      var sPath = oCtx.getPath();
      var iIndex = parseInt(sPath.split("/").pop(), 10);
      if (isNaN(iIndex)) return;

      var sNewTransform = oEvent.getParameter("selectedItem").getKey();
      var aRules = (this._oModel.getProperty("/selectedFMResponseRules") || []).slice();
      if (aRules[iIndex]) {
        aRules[iIndex].transform = sNewTransform;
        this._saveResponseRulesAndRefresh(aRules);
      }
    },

    onExtractResponseFields: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var sResponseRaw = this._oModel.getProperty("/selectedFMResponseSampleJson");
      var oResponseJson;
      try { oResponseJson = JSON.parse(sResponseRaw); } catch (e) {
        MessageBox.error(this._getText("fmInvalidSAPJson")); return;
      }

      var aKeys = this._flattenJsonKeys(oResponseJson);
      var aExistingRules = (this._oModel.getProperty("/selectedFMResponseRules") || []).slice();
      var existingSourceFields = {};
      aExistingRules.forEach(function (r) { existingSourceFields[r.source_field] = true; });

      var iAdded = 0;
      aKeys.forEach(function (key) {
        if (!existingSourceFields[key]) {
          aExistingRules.push({ source_field: key, target_field: "", transform: "DIRECT" });
          iAdded++;
        }
      });

      if (iAdded === 0) {
        MessageToast.show(this._getText("fmNoNewFields"));
        return;
      }

      var that = this;
      API.put("/api/config/field-mappings/" + oFound.profile.id, {
        response_rules: aExistingRules,
        threepl_response_sample_json: oResponseJson
      }).then(function (result) {
        if (result.data && !Array.isArray(result.data)) {
          MessageToast.show(that._getText("fmFieldsExtracted", [iAdded]));
          that._oModel.setProperty("/selectedFMResponseRules", aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/response_rules", aExistingRules);
          that._oModel.setProperty("/fieldMappings/" + oFound.index + "/threepl_response_sample_json", oResponseJson);
        }
      });
    },

    onAutoMapResponse: function () {
      var oFound = this._getSelectedFMProfile();
      if (!oFound) return;

      var aRules = (this._oModel.getProperty("/selectedFMResponseRules") || []).slice();
      var iMatched = 0;

      aRules.forEach(function (rule) {
        if (rule.source_field && !rule.target_field) {
          var parts = rule.source_field.split(".");
          rule.target_field = parts[parts.length - 1].replace(/\[\]/g, "");
          iMatched++;
        }
      });

      if (iMatched === 0) {
        MessageToast.show(this._getText("fmNoNewFields"));
        return;
      }

      this._saveResponseRulesAndRefresh(aRules);
      MessageToast.show(this._getText("fmAutoMapped", [iMatched]));
    }
  };
});

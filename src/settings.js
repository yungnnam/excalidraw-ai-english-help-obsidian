// 设置项
//
// 界面文字全部走 i18n.t()：按「界面语言」取词（uiLang 为空就跟着母语），
// 所以母语是中文也能把设置页切成英文，反过来也行。
import { modeLabel, normalizeLang, t } from "./i18n.js";
import { MODE_ORDER } from "./registry.js";

export const DEFAULT_SETTINGS = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
  defaultMode: "grammar",
  userLevel: "A2",
  // 界面语言：空 = 跟随母语；"zh" / "en" = 单独指定
  uiLang: "",
  // 母语 / 学习语言：决定讲解语言、例句语言和翻译方向
  nativeLang: "zh",
  learnLang: "en",
  translateDirection: "auto",
  cardWidth: 440,
  cardPosition: "right",
  expandSelection: true,
  showUkPhonetic: false,
  showFamily: true,
  showScore: true,
  confirmBeforeSend: false,
  cacheEnabled: true,
  deepThink: false,
  autoArchive: false,
  archiveFolder: "英语学习/Coach",
  timeoutMs: 45000,
  showFloatBar: true,
  floatBarPos: null,
};

export class CoachSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // 改语言后：整页重画 + 悬浮窗上的按钮也跟着换字
  refresh() {
    this.display();
    if (this.plugin.refreshFloatBar) this.plugin.refreshFloatBar();
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const L = (key, vars) => t(key, s, vars);

    containerEl.empty();
    containerEl.createEl("h2", { text: L("appName") });

    // ---------------- 语言 ----------------
    containerEl.createEl("h3", { text: L("secLanguage") });

    new Setting(containerEl)
      .setName(L("setUiLang"))
      .setDesc(L("descUiLang"))
      .addDropdown((d) => {
        d.addOption("", L("optFollow"));
        d.addOption("zh", "中文");
        d.addOption("en", "English");
        d.setValue(s.uiLang === "zh" || s.uiLang === "en" ? s.uiLang : "").onChange(async (v) => {
          s.uiLang = v === "zh" || v === "en" ? v : "";
          await this.plugin.saveSettings();
          this.refresh();
        });
      });

    new Setting(containerEl)
      .setName(L("setNative"))
      .setDesc(L("descNative"))
      .addDropdown((d) => {
        d.addOption("zh", "中文");
        d.addOption("en", "English");
        d.setValue(normalizeLang(s.nativeLang)).onChange(async (v) => {
          s.nativeLang = normalizeLang(v);
          if (s.learnLang === s.nativeLang) s.learnLang = s.nativeLang === "zh" ? "en" : "zh";
          await this.plugin.saveSettings();
          this.refresh();
        });
      });

    new Setting(containerEl)
      .setName(L("setLearn"))
      .setDesc(L("descLearn"))
      .addDropdown((d) => {
        d.addOption("zh", "中文");
        d.addOption("en", "English");
        d.setValue(normalizeLang(s.learnLang)).onChange(async (v) => {
          s.learnLang = normalizeLang(v);
          if (s.learnLang === s.nativeLang) s.nativeLang = s.learnLang === "zh" ? "en" : "zh";
          await this.plugin.saveSettings();
          this.refresh();
        });
      });


    new Setting(containerEl)
      .setName(L("setLevel"))
      .setDesc(L("descLevel"))
      .addDropdown((d) => {
        for (const lv of ["A1", "A2", "B1", "B2"]) d.addOption(lv, lv);
        d.setValue(s.userLevel).onChange(async (v) => {
          s.userLevel = v;
          await this.plugin.saveSettings();
        });
      });

    // ---------------- 连接 ----------------
    containerEl.createEl("h3", { text: L("secApi") });

    new Setting(containerEl)
      .setName(L("setApiKey"))
      .setDesc(L("descApiKey"))
      .addText((el) =>
        el.setPlaceholder("sk-...").setValue(s.apiKey).onChange(async (v) => {
          s.apiKey = v.trim();
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setBaseUrl"))
      .setDesc(L("descBaseUrl"))
      .addText((el) =>
        el.setPlaceholder("https://api.deepseek.com").setValue(s.baseUrl).onChange(async (v) => {
          s.baseUrl = v.trim().replace(/\/+$/, "") || DEFAULT_SETTINGS.baseUrl;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setModel"))
      .setDesc(L("descModel"))
      .addText((el) =>
        el.setValue(s.model).onChange(async (v) => {
          s.model = v.trim() || DEFAULT_SETTINGS.model;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setDeepThink"))
      .setDesc(L("descDeepThink"))
      .addToggle((el) =>
        el.setValue(!!s.deepThink).onChange(async (v) => {
          s.deepThink = v;
          await this.plugin.saveSettings();
        })
      );

    // ---------------- 模式 ----------------
    containerEl.createEl("h3", { text: L("secMode") });

    new Setting(containerEl)
      .setName(L("setDefaultMode"))
      .setDesc(L("descDefaultMode"))
      .addDropdown((d) => {
        for (const m of MODE_ORDER) d.addOption(m.id, m.emoji + " " + modeLabel(m, s));
        d.setValue(s.defaultMode).onChange(async (v) => {
          s.defaultMode = v;
          await this.plugin.saveSettings();
        });
      });

    // ---------------- 卡片 ----------------
    containerEl.createEl("h3", { text: L("secCard") });

    new Setting(containerEl)
      .setName(L("setCardWidth"))
      .setDesc(L("descCardWidth"))
      .addDropdown((d) => {
        d.addOption("360", L("optNarrow"));
        d.addOption("440", L("optDefault"));
        d.addOption("520", L("optWide"));
        d.setValue(String(s.cardWidth)).onChange(async (v) => {
          s.cardWidth = Number(v) || 440;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(L("setCardPos"))
      .setDesc(L("descCardPos"))
      .addDropdown((d) => {
        d.addOption("right", L("optPosRight"));
        d.addOption("below", L("optPosBelow"));
        d.setValue(s.cardPosition).onChange(async (v) => {
          s.cardPosition = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(L("setFloatBar"))
      .setDesc(L("descFloatBar"))
      .addToggle((el) =>
        el.setValue(s.showFloatBar !== false).onChange(async (v) => {
          s.showFloatBar = v;
          await this.plugin.saveSettings();
          if (this.plugin.syncFloatBar) this.plugin.syncFloatBar();
        })
      )
      .addButton((b) =>
        b.setButtonText(L("btnResetPos")).onClick(async () => {
          if (this.plugin.floatBar) this.plugin.floatBar.resetPosition();
          else {
            s.floatBarPos = null;
            await this.plugin.saveSettings();
          }
          new Notice(L("noticeResetPos"));
        })
      );

    // ---------------- 模式选项 ----------------
    containerEl.createEl("h3", { text: L("secModeOptions") });

    new Setting(containerEl)
      .setName("🔤 " + L("setUk"))
      .setDesc(L("descUk"))
      .addToggle((el) =>
        el.setValue(!!s.showUkPhonetic).onChange(async (v) => {
          s.showUkPhonetic = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("🔤 " + L("setFamily"))
      .addToggle((el) =>
        el.setValue(s.showFamily !== false).onChange(async (v) => {
          s.showFamily = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("📝 " + L("setScore"))
      .setDesc(L("descScore"))
      .addToggle((el) =>
        el.setValue(s.showScore !== false).onChange(async (v) => {
          s.showScore = v;
          await this.plugin.saveSettings();
        })
      );

    // ---------------- 行为 ----------------
    containerEl.createEl("h3", { text: L("secBehavior") });

    new Setting(containerEl)
      .setName(L("setExpand"))
      .setDesc(L("descExpand"))
      .addToggle((el) =>
        el.setValue(s.expandSelection !== false).onChange(async (v) => {
          s.expandSelection = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setConfirm"))
      .setDesc(L("descConfirm"))
      .addToggle((el) =>
        el.setValue(!!s.confirmBeforeSend).onChange(async (v) => {
          s.confirmBeforeSend = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setCache"))
      .setDesc(L("descCache"))
      .addToggle((el) =>
        el.setValue(s.cacheEnabled !== false).onChange(async (v) => {
          s.cacheEnabled = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setArchive"))
      .setDesc(L("descArchive"))
      .addToggle((el) =>
        el.setValue(!!s.autoArchive).onChange(async (v) => {
          s.autoArchive = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setArchiveFolder"))
      .addText((el) =>
        el.setValue(s.archiveFolder).onChange(async (v) => {
          s.archiveFolder = v.trim() || DEFAULT_SETTINGS.archiveFolder;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(L("setClearCache"))
      .addButton((b) =>
        b.setButtonText(L("btnClear")).onClick(async () => {
          this.plugin.data.cache = {};
          await this.plugin.saveSettingsData();
          new Notice(L("noticeCleared"));
        })
      );
  }
}

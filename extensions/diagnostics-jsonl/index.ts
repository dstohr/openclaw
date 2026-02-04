import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { createDiagnosticsJsonlService } from "./src/service.js";

const plugin = {
  id: "diagnostics-jsonl",
  name: "Diagnostics JSONL",
  description: "Export diagnostics events to a local JSONL file",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    api.registerService(createDiagnosticsJsonlService());
  },
};

export default plugin;

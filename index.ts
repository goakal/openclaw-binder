import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/core";
import { binderPlugin } from "./src/channel.js";
import { setBinderRuntime } from "./src/runtime.js";

const plugin = {
  id: "binder",
  name: "Binder",
  description: "OpenClaw Binder channel plugin — respond to @mentions in Binder groups",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setBinderRuntime(api.runtime);
    api.registerChannel({ plugin: binderPlugin });
  },
};

export default plugin;

import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { binderPlugin } from "./src/channel.js";
export default defineSetupPluginEntry(binderPlugin);

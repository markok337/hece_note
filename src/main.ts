import "./style.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { trackAppHeight } from "./core/viewport.svelte";
import { setupAutoUpdate } from "./pwa";

trackAppHeight();
setupAutoUpdate();
mount(App, { target: document.querySelector<HTMLDivElement>("#app")! });

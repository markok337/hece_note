import "./style.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { trackToday } from "./core/clock.svelte";
import { trackAppHeight } from "./core/viewport.svelte";
import { setupAutoUpdate } from "./pwa";

trackAppHeight();
trackToday();
setupAutoUpdate();
mount(App, { target: document.querySelector<HTMLDivElement>("#app")! });

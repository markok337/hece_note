import "./style.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { setupAutoUpdate } from "./pwa";

setupAutoUpdate();
mount(App, { target: document.querySelector<HTMLDivElement>("#app")! });

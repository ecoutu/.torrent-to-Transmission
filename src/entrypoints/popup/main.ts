import { mount } from 'svelte';
import '@/assets/theme.css';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './pages/HomeView.vue';
import AnalysisView from './pages/AnalysisView.vue';
import ReportView from './pages/ReportView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/analysis', component: AnalysisView },
    { path: '/report/:id', component: ReportView, props: true },
  ],
});

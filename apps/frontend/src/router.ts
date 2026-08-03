import { createRouter, createWebHistory } from 'vue-router';
import HomeView from './pages/HomeView.vue';
import AnalysisView from './pages/AnalysisView.vue';
import ReportView from './pages/ReportView.vue';
import RepoReportView from './pages/RepoReportView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/analysis', component: AnalysisView },
    { path: '/report/:id', component: ReportView, props: true },
    { path: '/report/:analysisId/repo/:repoName', component: RepoReportView, props: true },
  ],
});

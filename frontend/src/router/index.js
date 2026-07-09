import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const Login = () => import('../pages/login.vue');
const Register = () => import('../pages/register.vue');
const DashboardLayout = () => import('../layouts/DashboardLayout.vue');
const DashboardHome = () => import('../pages/dashboard/index.vue');
const PotsPage = () => import('../pages/dashboard/pots.vue');
const PotDetail = () => import('../pages/dashboard/pot-detail.vue');
const AlertsPage = () => import('../pages/dashboard/alerts.vue');
const SettingsPage = () => import('../pages/dashboard/settings.vue');
const UsersPage = () => import('../pages/admin/users.vue');

const routes = [
  { path: '/login', component: Login, meta: { public: true } },
  { path: '/register', component: Register, meta: { public: true } },
  {
    path: '/dashboard',
    component: DashboardLayout,
    children: [
      { path: '', component: DashboardHome },
      { path: 'pots', component: PotsPage },
      { path: 'pots/:id', component: PotDetail },
      { path: 'alerts', component: AlertsPage },
      { path: 'settings', component: SettingsPage },
      { path: 'users', component: UsersPage, meta: { roles: ['admin'] } }
    ]
  },
  { path: '/', redirect: '/dashboard' },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (!auth.accessToken) auth.hydrate();

  if (to.meta.public) return true;
  if (!auth.isAuthenticated) return { path: '/login' };

  if (to.meta.roles && !to.meta.roles.includes(auth.user?.role)) {
    return { path: '/dashboard' };
  }
  return true;
});

export default router;

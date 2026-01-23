/**
 * 用户认证模块
 */

import { supabase } from './supabase.js';

// 当前用户状态
let currentUser = null;

/**
 * 初始化认证模块
 */
export async function initAuth() {
  const userInfo = document.querySelector('.user-info');
  
  // 检查当前会话
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
  }
  
  // 更新UI
  updateUserUI(currentUser);
  
  // 显示用户信息区域（CSS 中默认隐藏）
  if (userInfo) {
    userInfo.classList.add('loaded');
  }
  
  // 监听认证状态变化
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUser = session.user;
      updateUserUI(currentUser);
      hideAuthModal();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      updateUserUI(null);
    }
  });
  
  // 绑定UI事件
  bindAuthEvents();
}

/**
 * 获取当前用户
 */
export function getCurrentUser() {
  return currentUser;
}

/**
 * 邮箱密码注册
 */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password
  });
  
  if (error) throw error;
  return data;
}

/**
 * 邮箱密码登录
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  return data;
}

/**
 * 退出登录
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * 更新用户界面
 */
function updateUserUI(user) {
  const userAvatar = document.querySelector('.user-avatar');
  const userName = document.querySelector('.user-name');
  const userRole = document.querySelector('.user-role');
  const userInfo = document.querySelector('.user-info');
  
  if (user) {
    // 已登录状态
    const displayName = user.email?.split('@')[0] || '用户';
    if (userAvatar) userAvatar.textContent = displayName.charAt(0).toUpperCase();
    if (userName) userName.textContent = displayName;
    if (userRole) userRole.textContent = '点击退出';
    if (userInfo) userInfo.classList.add('logged-in');
  } else {
    // 未登录状态
    if (userAvatar) userAvatar.textContent = '?';
    if (userName) userName.textContent = '未登入';
    if (userRole) userRole.textContent = '点击登录';
    if (userInfo) userInfo.classList.remove('logged-in');
  }
}

/**
 * 绑定认证相关事件
 */
function bindAuthEvents() {
  // 点击用户信息区域 - 未登录显示登录框，已登录则退出
  const userInfo = document.querySelector('.user-info');
  if (userInfo) {
    userInfo.style.cursor = 'pointer';
    userInfo.addEventListener('click', async () => {
      if (currentUser) {
        // 已登录 - 确认退出
        if (confirm('确定要退出登录吗？')) {
          await handleLogout();
        }
      } else {
    // 未登录 - 显示登录框
        showAuthModal();
      }
    });
  }
  
  // 登录表单提交
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }
  
  // 注册表单提交
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegister);
  }
  
  // 切换登录/注册
  const switchToRegister = document.getElementById('switch-to-register');
  const switchToLogin = document.getElementById('switch-to-login');
  
  if (switchToRegister) {
    switchToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('login-form').style.display = 'none';
      document.getElementById('register-form').style.display = 'block';
    });
  }
  
  if (switchToLogin) {
    switchToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('register-form').style.display = 'none';
      document.getElementById('login-form').style.display = 'block';
    });
  }
  
  // 关闭模态框
  const closeBtn = document.querySelector('.auth-modal-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideAuthModal);
  }
  
  // 点击遮罩关闭
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideAuthModal();
      }
    });
  }
}

/**
 * 显示认证模态框
 */
export function showAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.style.display = 'flex';
    // 重置到登录表单
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
  }
}

/**
 * 隐藏认证模态框
 */
export function hideAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  // 清除错误信息
  const errorEl = document.getElementById('auth-error');
  if (errorEl) errorEl.textContent = '';
}

/**
 * 处理登录
 */
async function handleLogin(e) {
  e.preventDefault();
  
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('auth-error');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = '登录中...';
    
    await signIn(email, password);
    // 成功后会通过 onAuthStateChange 处理
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = getErrorMessage(error);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '登录';
  }
}

/**
 * 处理注册
 */
async function handleRegister(e) {
  e.preventDefault();
  
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  const confirmPassword = document.getElementById('register-confirm-password').value;
  const errorEl = document.getElementById('auth-error');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  
  if (password !== confirmPassword) {
    if (errorEl) errorEl.textContent = '两次输入的密码不一致';
    return;
  }
  
  if (password.length < 6) {
    if (errorEl) errorEl.textContent = '密码长度至少6位';
    return;
  }
  
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = '注册中...';
    
    await signUp(email, password);
    
    if (errorEl) {
      errorEl.style.color = '#10B981';
      errorEl.textContent = '注册成功！请查收验证邮件后登录';
    }
  } catch (error) {
    if (errorEl) {
      errorEl.style.color = '#EF4444';
      errorEl.textContent = getErrorMessage(error);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '注册';
  }
}

/**
 * 处理退出登录
 */
async function handleLogout() {
  try {
    await signOut();
  } catch (error) {
    console.error('退出登录失败:', error);
  }
}

/**
 * 错误信息转换
 */
function getErrorMessage(error) {
  const message = error.message || error.toString();
  
  if (message.includes('Invalid login credentials')) {
    return '邮箱或密码错误';
  }
  if (message.includes('Email not confirmed')) {
    return '邮箱未验证，请查收验证邮件';
  }
  if (message.includes('User already registered')) {
    return '该邮箱已注册';
  }
  if (message.includes('Invalid email')) {
    return '邮箱格式不正确';
  }
  if (message.includes('Password')) {
    return '密码不符合要求';
  }
  
  return message;
}

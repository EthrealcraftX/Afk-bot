document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signupForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const errorMessage = document.getElementById('errorMessage');

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validatsiya
    if (!username || !password || !confirmPassword) {
      showError('All fields are required');
      return;
    }

    if (password !== confirmPassword) {
      showError('Passwords do not match');
      return;
    }

    if (username.length < 4) {
      showError('Username must be at least 4 characters');
      return;
    }

    if (password.length < 6) {
      showError('Password must be at least 6 characters');
      return;
    }

    try {
      // Yuklash holatini ko'rsatish
      const submitBtn = signupForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right:8px;"></i> Acc yaratilmoqda...';

      // APIga so'rov yuborish
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const result = await response.json();

      if (result.success) {
        // Ro'yxatdan o'tish muvaffaqiyatli bo'lsa, login sahifasiga yo'naltirish
        window.location.href = 'login.html?signupSuccess=true';
      } else {
        showError(result.error || 'Signup failed. Please try again.');
      }
    } catch (error) {
      console.error('Signup error:', error);
      showError('Network error. Please try again.');
    } finally {
      const submitBtn = signupForm.querySelector('button[type="submit"]');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Sign Up</span><i class="fa-solid fa-user-plus" style="margin-left:8px;"></i>';
    }
  });

  function showError(message) {
    const errorText = document.getElementById('errorText');
    if (errorText) {
      errorText.textContent = message;
    } else {
      errorMessage.textContent = message;
    }
    
    errorMessage.style.display = 'flex';
    
    // Add wiggle shake to the visual auth box
    const authBox = document.getElementById('authBox');
    if (authBox) {
      authBox.style.animation = 'none';
      authBox.offsetHeight; // force reflow trigger
      authBox.style.animation = 'authShake 0.4s ease';
    }
    
    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 6000);
  }
});
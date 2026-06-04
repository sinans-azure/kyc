const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const insuranceScreen = document.getElementById('insurance-screen');
const navDashboard = document.getElementById('nav-dashboard');
const navInsurance = document.getElementById('nav-insurance');
const navLogin = document.getElementById('nav-login');
const userName = document.getElementById('user-name');
const insuranceStatus = document.getElementById('insurance-status');
const accountList = document.getElementById('account-list');
const transactionList = document.getElementById('transaction-list');
const insuranceForm = document.getElementById('insurance-form');
const insuranceResult = document.getElementById('insurance-result');
const insuranceList = document.getElementById('insurance-list');

let currentUser = null;

const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
};

function showSection(section) {
  loginScreen.classList.add('hidden');
  dashboardScreen.classList.add('hidden');
  insuranceScreen.classList.add('hidden');
  section.classList.remove('hidden');
  // Add animation class
  section.classList.add('screen-section');
}

function setActiveTab(tab) {
  navDashboard.classList.remove('btn-primary');
  navInsurance.classList.remove('btn-primary');
  navDashboard.classList.add('btn-secondary');
  navInsurance.classList.add('btn-secondary');
  tab.classList.remove('btn-secondary');
  tab.classList.add('btn-primary');
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  return response.json();
}

async function loadDashboard() {
  accountList.innerHTML = '<p class="text-sm text-gray-600">Loading accounts...</p>';
  transactionList.innerHTML = '<p class="text-sm text-gray-600">Loading transactions...</p>';
  try {
    const accounts = await fetchJson('/api/accounts');
    const transactions = await fetchJson('/api/transactions');
    accountList.innerHTML = accounts.map(account => `
      <div class="p-4 border rounded-lg bg-slate-50">
        <h4 class="font-semibold">${account.type}</h4>
        <p class="text-sm text-gray-600">Balance: ${formatCurrency(account.balance, account.currency)}</p>
      </div>
    `).join('') || '<p class="text-sm text-gray-600">No accounts found.</p>';

    transactionList.innerHTML = transactions.map(tx => `
      <div class="p-4 border rounded-lg bg-slate-50">
        <p class="font-medium">${tx.description}</p>
        <p class="text-sm text-gray-600">${tx.type.toUpperCase()} • ${new Date(tx.created_at).toLocaleDateString()}</p>
        <p class="mt-2 font-semibold ${tx.amount >= 0 ? 'text-green-700' : 'text-red-700'}">${tx.amount >= 0 ? '+' : ''}${formatCurrency(Math.abs(tx.amount))}</p>
      </div>
    `).join('') || '<p class="text-sm text-gray-600">No transactions yet.</p>';
  } catch (error) {
    accountList.innerHTML = '<p class="text-sm text-red-600">Unable to load accounts.</p>';
    transactionList.innerHTML = '<p class="text-sm text-red-600">Unable to load transactions.</p>';
  }
}

async function loadInsurance() {
  insuranceList.innerHTML = '<p class="text-sm text-gray-600">Loading insurance requests...</p>';
  try {
    const requests = await fetchJson('/api/insurance');
    insuranceList.innerHTML = requests.map(item => `
      <div class="p-4 border rounded-lg bg-slate-50">
        <div class="flex justify-between gap-4">
          <div>
            <p class="font-semibold">${item.full_name}</p>
            <p class="text-sm text-gray-600">Status: ${item.status}</p>
          </div>
          <div class="text-right text-sm text-gray-600">
            <p>${item.created_at ? new Date(item.created_at).toLocaleString() : ''}</p>
            <p>${item.email_sent ? 'Email sent' : 'Email pending'}</p>
          </div>
        </div>
        <div class="mt-2 text-sm">
          <p>Age: ${item.age || '-'}</p>
          <p>Premium: ${item.premium ? formatCurrency(item.premium) : '-'}</p>
        </div>
      </div>
    `).join('') || '<p class="text-sm text-gray-600">No insurance requests yet.</p>';
  } catch (error) {
    insuranceList.innerHTML = '<p class="text-sm text-red-600">Unable to load insurance requests.</p>';
  }
}

document.getElementById('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const submitBtn = event.target.querySelector('button[type="submit"]');

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';
    }
    const response = await fetchJson('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (response.error) {
      alert('Login failed: ' + response.error);
      return;
    }

    currentUser = response.user;
    userName.textContent = `Hello, ${currentUser.name}`;
    insuranceStatus.textContent = 'Ready for your insurance upload.';
    showSection(dashboardScreen);
    setActiveTab(navDashboard);
    loadDashboard();
    loadInsurance();
  } catch (error) {
    alert('Login failed. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
    }
  }
});

navDashboard.addEventListener('click', () => {
  if (!currentUser) {
    showSection(loginScreen);
    setActiveTab(navLogin);
    return;
  }
  showSection(dashboardScreen);
  setActiveTab(navDashboard);
  loadDashboard();
});

navInsurance.addEventListener('click', () => {
  if (!currentUser) {
    showSection(loginScreen);
    setActiveTab(navLogin);
    return;
  }
  showSection(insuranceScreen);
  setActiveTab(navInsurance);
  loadInsurance();
});

navLogin.addEventListener('click', () => {
  showSection(loginScreen);
  setActiveTab(navLogin);
});

insuranceForm.addEventListener('submit', async event => {
  event.preventDefault();
  
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }
  insuranceResult.innerHTML = '<span class="text-blue-600">Submitting your request...</span>';

  const fullName = document.getElementById('insurance-fullname').value;
  const email = document.getElementById('insurance-email').value;
  const documentFile = document.getElementById('insurance-document').files[0];

  if (!documentFile) {
    insuranceResult.innerHTML = '<span class="text-red-600">Please upload a document file.</span>';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    }
    return;
  }

  const formData = new FormData();
  formData.append('fullName', fullName);
  formData.append('email', email);
  formData.append('document', documentFile);

  try {
    const response = await fetch('/api/insurance/request', {
      method: 'POST',
      body: formData
    });
    const result = await response.json();

    if (result.error) {
      insuranceResult.innerHTML = `<span class="text-red-600">Error: ${result.error}</span>`;
      return;
    }

    insuranceResult.innerHTML = `<span class="text-green-600">Request submitted successfully. Your request is being processed.</span>`;
    insuranceForm.reset();
    // Give a moment for the user to read the success message before reloading
    setTimeout(() => {
        loadInsurance();
    }, 1000);
  } catch (error) {
    insuranceResult.innerHTML = '<span class="text-red-600">Failed to submit insurance request. Try again later.</span>';
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Request';
    }
  }
});

showSection(loginScreen);
setActiveTab(navLogin);
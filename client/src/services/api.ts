const API_BASE_URL = 'http://localhost:5000/api';

interface RequestOptions extends RequestInit {
  body?: any;
}

export const apiClient = async (endpoint: string, options: RequestOptions = {}) => {
  const token = localStorage.getItem('codesync_token');
  
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  });

  const config: RequestInit = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    return data;
  } catch (error: any) {
    console.error(`API Error on ${endpoint}:`, error.message);
    throw error;
  }
};

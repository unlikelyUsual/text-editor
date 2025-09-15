const API_URL = 'http://localhost:4000/collab';

export async function fetchSteps() {
  const res = await fetch(`${API_URL}/steps`);
  return res.json();
}

export async function submitSteps(steps: any[], version: number) {
  const res = await fetch(`${API_URL}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steps, version })
  });
  return res;
}

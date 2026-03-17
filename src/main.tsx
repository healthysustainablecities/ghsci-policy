import React from "react";
import ReactDOM from "react-dom/client";
import { Authenticator, useAuthenticator, TextField, CheckboxField } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import './styles.css';
import App from "./App.tsx";
import "./index.css";

import { Amplify } from "aws-amplify";
import outputs from "../amplify_outputs.json";
Amplify.configure(outputs);

// Nominatim place combobox — searches globally for any place type as the user
// types. On selection, hidden inputs carry the place name, country, lat and lon
// into Amplify's form state.
interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
  address?: { country?: string };
}

function setHiddenInput(id: string, value: string) {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function LocationCombobox() {
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<NominatimResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState('');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = (value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(value);
    setSelected('');
    if (!value.trim()) { setResults([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const lang = navigator.language.split('-')[0];
        const params = new URLSearchParams({
          q: value,
          format: 'jsonv2',
          addressdetails: '1',
          limit: '10',
          featuretype: 'settlement',
          'accept-language': lang,
        });
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?${params}`,
          { headers: { 'Accept-Language': lang } }
        );
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 600);
  };

  const pick = (r: NominatimResult) => {
    const name = r.display_name;
    const country = r.address?.country ?? '';
    setSelected(name);
    setQuery(name);
    setResults([]);
    setOpen(false);
    setHiddenInput('loc-city-input', name);
    setHiddenInput('loc-country-input', country);
    setHiddenInput('loc-lat-input', r.lat);
    setHiddenInput('loc-lon-input', r.lon);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', marginBottom: '1rem' }}>
      <label style={{ display: 'block', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
        Location <span style={{ color: 'red' }}>*</span>
      </label>
      <input
        type="text"
        value={query}
        placeholder="Start typing a city, town or region…"
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        data-form-type="other"
        onChange={e => search(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        style={{
          width: '100%', padding: '8px 12px', fontSize: '14px',
          border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box',
        }}
      />
      {loading && (
        <span style={{ position: 'absolute', right: '10px', top: '34px', fontSize: '12px', color: '#888' }}>
          searching…
        </span>
      )}
      {open && results.length > 0 && (
        <ul style={{
          position: 'absolute', zIndex: 9999, width: '100%', margin: 0, padding: 0,
          listStyle: 'none', background: '#fff', border: '1px solid #ccc',
          borderRadius: '0 0 4px 4px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
          maxHeight: '220px', overflowY: 'auto',
        }}>
          {results.map((r, i) => (
            <li
              key={i}
              onMouseDown={() => pick(r)}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', lineHeight: '1.4' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f0f0f0')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              {r.display_name}
            </li>
          ))}
        </ul>
      )}
      {!selected && query && !loading && (
        <span style={{ fontSize: '12px', color: '#c00', marginTop: '2px', display: 'block' }}>
          Please select a location from the suggestions
        </span>
      )}
      {selected && (
        <span style={{ fontSize: '12px', color: '#4a4', marginTop: '2px', display: 'block' }}>
          ✓ Location selected
        </span>
      )}
      {/* Hidden inputs carry values into Amplify's form state */}
      {(['city', 'country', 'lat', 'lon'] as const).map(field => (
        <input
          key={field}
          id={`loc-${field}-input`}
          name={`custom:${field}`}
          type="text"
          readOnly
          defaultValue=""
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
          tabIndex={-1}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function SignUpFormFields() {
  return (
    <>
      <Authenticator.SignUp.FormFields />
      <LocationCombobox />
      <TextField
        label="Affiliation"
        name="custom:affiliation"
        placeholder="Your organisation or institution"
        isRequired
      />
      <CheckboxField
        label="I would like to be contacted about updates on this app and the 1000 Cities Challenge"
        name="custom:contact_optin"
        value="true"
      />
    </>
  );
}

const components = {
  SignUp: {
    FormFields: SignUpFormFields,
  },
};

const formFields = {
  signUp: {
    name: {
      label: "Full Name",
      placeholder: "Your full name",
      isRequired: true,
      order: 1,
    },
    email: { order: 2 },
    password: { order: 3 },
    confirm_password: { order: 4 },
  },
};

const services = {
  async validateCustomSignUp(formData: Record<string, string>) {
    const errors: Record<string, string> = {};
    if (!formData["custom:city"]) {
      errors["custom:city"] = "Please select a location from the suggestions";
    }
    if (!formData["custom:affiliation"]) {
      errors["custom:affiliation"] = "Affiliation is required";
    }
    return errors;
  },
};

function Root() {
  const { authStatus } = useAuthenticator(ctx => [ctx.authStatus]);
  if (authStatus === 'authenticated') return <App />;
  return (
    <main className="main-container">
      <header className="header">
        <div>
          <div className="title-row">
            <h1>GHSCI Policy</h1>
            <img src="/GOHSC - white logo transparent-01.svg" alt="GOHSC logo" className="title-logo" />
          </div>
          <h2>Global Healthy and Sustainable City Indicators Policy analysis and reporting tool</h2>
          <p>A tool to support analysis and reporting of policy indicators for the Global Observatory of Healthy and Sustainable Cities' <a href="https://www.healthysustainablecities.org/1000cities/" target="_blank" rel="noopener noreferrer">1000 Cities Challenge</a>.</p>
          <p>Developed out of RMIT University's Centre for Urban Research by <a href="https://cur.org.au/people/carl-higgs/" target="_blank" rel="noopener noreferrer">Dr Carl Higgs</a> and <a href="https://cur.org.au/people/dr-melanie-lowe/" target="_blank" rel="noopener noreferrer">Dr Melanie Lowe</a> with the support of <a href="https://www.rmit.edu.au/partner/hubs/race" target="_blank" rel="noopener noreferrer">RMIT's Advanced Cloud Ecosystem Hub</a> and the <a href="https://www.healthysustainablecities.org/" target="_blank" rel="noopener noreferrer">Global Observatory of Healthy and Sustainable Cities</a>.</p>
        </div>
      </header>
      <Authenticator components={components} formFields={formFields} services={services} />
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Authenticator.Provider>
      <Root />
    </Authenticator.Provider>
  </React.StrictMode>
);

import React from 'react';
import { AlertCircle } from 'lucide-react';

export const DisclaimerBanner: React.FC = () => {
  return (
    <footer style={{
      marginTop: '24px',
      padding: '16px 20px',
      backgroundColor: 'var(--bg-surface)',
      border: '1px solid var(--border-light)',
      borderRadius: 'var(--radius-sm)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      fontSize: '0.74rem',
      color: 'var(--text-muted)',
      lineHeight: '1.5'
    }}>
      <AlertCircle size={18} color="var(--risk-watch)" style={{ flexShrink: 0, marginTop: '2px' }} />
      <div>
        <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '3px' }}>
          OFFICIAL DISASTER MANAGEMENT & EARLY WARNING PROTOCOL
        </strong>
        ResQNet is an experimental hydrometeorological decision-support prototype integrating live Open-Meteo numerical weather forecasts, ECMWF reanalysis, and physical river basin hydrology. 
        It provides automated probabilistic flood risk indicators for disaster management planning and preliminary early-warning simulation. 
        <strong> Under no circumstances does this prototype replace or supersede official emergency directives, evacuation notices, or Red/Orange alerts issued by the Kerala State Disaster Management Authority (KSDMA), the India Meteorological Department (IMD), the Central Water Commission (CWC), or District Disaster Management Authorities (DDMAs). Obey all official state directives.</strong>
      </div>
    </footer>
  );
};

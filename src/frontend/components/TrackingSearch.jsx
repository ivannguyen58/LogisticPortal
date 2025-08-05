import React, { useState } from 'react';
import { Search, Package, AlertCircle } from 'lucide-react';
import './TrackingSearch.css';

const TrackingSearch = ({ onSearch, loading = false, error = null }) => {
  const [awbNumber, setAwbNumber] = useState('');
  const [isValid, setIsValid] = useState(true);

  // AWB format validation (XXX-XXXXXXXX)
  const validateAwbFormat = (awb) => {
    const awbPattern = /^\d{3}-\d{8}$/;
    return awbPattern.test(awb);
  };

  const handleInputChange = (e) => {
    const value = e.target.value.toUpperCase();
    setAwbNumber(value);
    
    // Real-time validation
    if (value && !validateAwbFormat(value)) {
      setIsValid(false);
    } else {
      setIsValid(true);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!awbNumber.trim()) {
      setIsValid(false);
      return;
    }

    if (!validateAwbFormat(awbNumber)) {
      setIsValid(false);
      return;
    }

    onSearch(awbNumber);
  };

  const handleKeyPress = (e) => {
    // Only allow numbers and dash
    if (!/[\d-]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
      e.preventDefault();
    }
  };

  const formatAwbInput = (value) => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '');
    
    // Format as XXX-XXXXXXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 11)}`;
    } else {
      return `${digits.slice(0, 3)}-${digits.slice(3, 11)}`;
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const formatted = formatAwbInput(pastedText);
    setAwbNumber(formatted);
    setIsValid(validateAwbFormat(formatted));
  };

  return (
    <div className="tracking-search">
      <div className="tracking-search-container">
        <div className="tracking-search-header">
          <Package className="tracking-search-icon" size={24} />
          <h2>Track Your Shipment</h2>
          <p>Enter your Air Waybill (AWB) number to track your shipment</p>
        </div>

        <form onSubmit={handleSubmit} className="tracking-search-form">
          <div className="input-group">
            <div className={`input-wrapper ${!isValid ? 'error' : ''} ${loading ? 'loading' : ''}`}>
              <input
                type="text"
                value={awbNumber}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                onPaste={handlePaste}
                placeholder="Enter AWB Number (e.g. 125-12345678)"
                className="awb-input"
                maxLength={12}
                disabled={loading}
                autoComplete="off"
              />
              <button
                type="submit"
                className="search-button"
                disabled={loading || !isValid || !awbNumber.trim()}
              >
                {loading ? (
                  <div className="loading-spinner" />
                ) : (
                  <Search size={20} />
                )}
              </button>
            </div>
            
            {!isValid && awbNumber && (
              <div className="error-message">
                <AlertCircle size={16} />
                <span>Please enter a valid AWB number (format: XXX-XXXXXXXX)</span>
              </div>
            )}

            {error && (
              <div className="error-message">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="format-help">
            <p>AWB Number Format: 3 digits, dash, 8 digits (e.g. 125-12345678)</p>
          </div>
        </form>

        <div className="tracking-search-examples">
          <h4>Sample AWB Numbers:</h4>
          <div className="example-awbs">
            <button
              type="button"
              onClick={() => {
                setAwbNumber('125-12345678');
                setIsValid(true);
              }}
              className="example-awb"
              disabled={loading}
            >
              125-12345678
            </button>
            <button
              type="button"
              onClick={() => {
                setAwbNumber('618-87654321');
                setIsValid(true);
              }}
              className="example-awb"
              disabled={loading}
            >
              618-87654321
            </button>
            <button
              type="button"
              onClick={() => {
                setAwbNumber('777-11223344');
                setIsValid(true);
              }}
              className="example-awb"
              disabled={loading}
            >
              777-11223344
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackingSearch;
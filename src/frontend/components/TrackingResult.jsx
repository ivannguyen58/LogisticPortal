import React, { useState } from 'react';
import { 
  Package, 
  MapPin, 
  Clock, 
  Plane, 
  AlertTriangle, 
  CheckCircle, 
  Truck,
  Calendar,
  Weight,
  Hash,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Bell,
  Copy,
  Share
} from 'lucide-react';
import TrackingTimeline from './TrackingTimeline';
import './TrackingResult.css';

const TrackingResult = ({ trackingData, loading = false, onSubscribeNotifications }) => {
  const [showAllEvents, setShowAllEvents] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  if (loading) {
    return (
      <div className="tracking-result loading">
        <div className="loading-container">
          <div className="loading-spinner-large" />
          <p>Loading tracking information...</p>
        </div>
      </div>
    );
  }

  if (!trackingData) {
    return null;
  }

  const {
    awb_number,
    current_status,
    current_location,
    origin_airport,
    destination_airport,
    estimated_delivery,
    has_exceptions,
    latest_event,
    tracking_events = []
  } = trackingData;

  const getStatusColor = (status) => {
    const statusColors = {
      'CREATED': '#6b7280',
      'BOOKED': '#3b82f6',
      'MANIFESTED': '#8b5cf6',
      'DEPARTED': '#f59e0b',
      'IN_TRANSIT': '#f97316',
      'ARRIVED': '#10b981',
      'CUSTOMS_CLEARANCE': '#ef4444',
      'OUT_FOR_DELIVERY': '#06b6d4',
      'DELIVERED': '#22c55e',
      'CANCELLED': '#dc2626',
      'ON_HOLD': '#f59e0b',
      'EXCEPTION': '#dc2626'
    };
    return statusColors[status] || '#6b7280';
  };

  const getStatusIcon = (status) => {
    const statusIcons = {
      'CREATED': Package,
      'BOOKED': CheckCircle,
      'MANIFESTED': Plane,
      'DEPARTED': Plane,
      'IN_TRANSIT': Truck,
      'ARRIVED': MapPin,
      'CUSTOMS_CLEARANCE': AlertTriangle,
      'OUT_FOR_DELIVERY': Truck,
      'DELIVERED': CheckCircle,
      'CANCELLED': AlertTriangle,
      'ON_HOLD': Clock,
      'EXCEPTION': AlertTriangle
    };
    return statusIcons[status] || Package;
  };

  const formatDateTime = (dateTime) => {
    if (!dateTime) return 'N/A';
    return new Date(dateTime).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // You might want to show a toast notification here
  };

  const shareTracking = () => {
    if (navigator.share) {
      navigator.share({
        title: `Shipment ${awb_number} Tracking`,
        text: `Track shipment ${awb_number} - Status: ${current_status}`,
        url: window.location.href
      });
    }
  };

  const StatusIcon = getStatusIcon(current_status);
  const statusColor = getStatusColor(current_status);

  const visibleEvents = showAllEvents ? tracking_events : tracking_events.slice(0, 5);

  return (
    <div className="tracking-result">
      {/* Header */}
      <div className="tracking-header">
        <div className="tracking-header-main">
          <div className="awb-info">
            <h1 className="awb-number">
              <Hash size={20} />
              {awb_number}
              <button 
                onClick={() => copyToClipboard(awb_number)}
                className="copy-button"
                title="Copy AWB number"
              >
                <Copy size={16} />
              </button>
            </h1>
            <div className="route-info">
              <span className="airport">{origin_airport}</span>
              <Plane size={16} className="route-arrow" />
              <span className="airport">{destination_airport}</span>
            </div>
          </div>
          
          <div className="action-buttons">
            <button onClick={shareTracking} className="action-button">
              <Share size={16} />
              Share
            </button>
            {onSubscribeNotifications && (
              <button 
                onClick={() => onSubscribeNotifications(awb_number)}
                className="action-button primary"
              >
                <Bell size={16} />
                Get Updates
              </button>
            )}
          </div>
        </div>

        {/* Status Banner */}
        <div className="status-banner" style={{ borderLeftColor: statusColor }}>
          <div className="status-info">
            <StatusIcon size={24} style={{ color: statusColor }} />
            <div>
              <h2 className="status-title" style={{ color: statusColor }}>
                {current_status.replace(/_/g, ' ')}
              </h2>
              {current_location && (
                <p className="status-location">
                  <MapPin size={16} />
                  {current_location}
                </p>
              )}
            </div>
          </div>
          
          {has_exceptions && (
            <div className="exception-indicator">
              <AlertTriangle size={16} />
              <span>Exceptions Detected</span>
            </div>
          )}
        </div>

        {/* Latest Update */}
        {latest_event && (
          <div className="latest-update">
            <Clock size={16} />
            <span>
              Last updated: {formatDateTime(latest_event.event_datetime)} - {latest_event.event_description}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="tracking-tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          Timeline ({tracking_events.length})
        </button>
        <button 
          className={`tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="overview-grid">
              {/* Delivery Info */}
              <div className="info-card">
                <h3>
                  <Calendar size={20} />
                  Delivery Information
                </h3>
                <div className="info-list">
                  <div className="info-item">
                    <span className="label">Estimated Delivery:</span>
                    <span className="value">
                      {estimated_delivery ? formatDateTime(estimated_delivery) : 'Calculating...'}
                    </span>
                  </div>
                  <div className="info-item">
                    <span className="label">Current Location:</span>
                    <span className="value">{current_location || 'In Transit'}</span>
                  </div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="info-card">
                <h3>
                  <Clock size={20} />
                  Recent Activity
                </h3>
                <div className="recent-events">
                  {visibleEvents.slice(0, 3).map((event, index) => (
                    <div key={index} className="recent-event">
                      <div className="event-time">
                        {formatDateTime(event.event_datetime)}
                      </div>
                      <div className="event-description">
                        {event.event_description}
                      </div>
                      {event.event_location && (
                        <div className="event-location">
                          <MapPin size={12} />
                          {event.event_location}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {tracking_events.length > 3 && (
                  <button 
                    className="view-all-button"
                    onClick={() => setActiveTab('timeline')}
                  >
                    View All Events ({tracking_events.length})
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="timeline-tab">
            <TrackingTimeline events={tracking_events} />
          </div>
        )}

        {activeTab === 'details' && (
          <div className="details-tab">
            <div className="details-grid">
              <div className="detail-section">
                <h3>Shipment Information</h3>
                <div className="detail-list">
                  <div className="detail-item">
                    <span className="label">AWB Number:</span>
                    <span className="value">{awb_number}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Origin:</span>
                    <span className="value">{origin_airport}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Destination:</span>
                    <span className="value">{destination_airport}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Current Status:</span>
                    <span className="value status" style={{ color: statusColor }}>
                      {current_status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3>Service Information</h3>
                <div className="detail-list">
                  <div className="detail-item">
                    <span className="label">Service Type:</span>
                    <span className="value">Air Freight</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Total Events:</span>
                    <span className="value">{tracking_events.length}</span>
                  </div>
                  <div className="detail-item">
                    <span className="label">Exceptions:</span>
                    <span className={`value ${has_exceptions ? 'exception' : 'no-exception'}`}>
                      {has_exceptions ? 'Yes' : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Exception Alert */}
      {has_exceptions && (
        <div className="exception-alert">
          <AlertTriangle size={20} />
          <div>
            <h4>Attention Required</h4>
            <p>This shipment has exceptions that may affect delivery. Please contact customer service for details.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrackingResult;
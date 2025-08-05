import React, { useState } from 'react';
import { 
  MapPin, 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Package, 
  Plane, 
  Truck,
  Filter,
  ChevronDown,
  Info
} from 'lucide-react';
import './TrackingTimeline.css';

const TrackingTimeline = ({ events = [] }) => {
  const [filter, setFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  const getEventIcon = (event) => {
    if (event.is_exception) return AlertTriangle;
    if (event.is_milestone) return CheckCircle;
    
    const eventIcons = {
      'SHIPMENT_CREATED': Package,
      'CARGO_COLLECTED': Package,
      'MANIFESTED': Plane,
      'FLIGHT_DEPARTED': Plane,
      'IN_TRANSIT': Truck,
      'FLIGHT_ARRIVED': Plane,
      'CUSTOMS_CLEARANCE': AlertTriangle,
      'CUSTOMS_CLEARED': CheckCircle,
      'OUT_FOR_DELIVERY': Truck,
      'DELIVERED': CheckCircle
    };
    
    return eventIcons[event.event_code] || MapPin;
  };

  const getEventColor = (event) => {
    if (event.is_exception) return '#dc2626';
    if (event.is_milestone) return '#059669';
    
    const severityColors = {
      'CRITICAL': '#dc2626',
      'ERROR': '#ea580c',
      'WARNING': '#d97706',
      'INFO': '#0891b2'
    };
    
    return severityColors[event.severity_level] || '#6b7280';
  };

  const formatDateTime = (dateTime) => {
    const date = new Date(dateTime);
    return {
      date: date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      })
    };
  };

  const getFilteredEvents = () => {
    switch (filter) {
      case 'milestones':
        return events.filter(event => event.is_milestone);
      case 'exceptions':
        return events.filter(event => event.is_exception);
      case 'locations':
        return events.filter(event => event.event_location);
      default:
        return events;
    }
  };

  const groupEventsByDate = (events) => {
    const grouped = {};
    events.forEach(event => {
      const date = new Date(event.event_datetime).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(event);
    });
    return grouped;
  };

  const filteredEvents = getFilteredEvents();
  const groupedEvents = groupEventsByDate(filteredEvents);
  const sortedDates = Object.keys(groupedEvents).sort((a, b) => new Date(b) - new Date(a));

  const filterOptions = [
    { value: 'all', label: 'All Events', count: events.length },
    { value: 'milestones', label: 'Milestones', count: events.filter(e => e.is_milestone).length },
    { value: 'exceptions', label: 'Exceptions', count: events.filter(e => e.is_exception).length },
    { value: 'locations', label: 'Location Updates', count: events.filter(e => e.event_location).length }
  ];

  if (events.length === 0) {
    return (
      <div className="tracking-timeline empty">
        <div className="empty-state">
          <Package size={48} />
          <h3>No Tracking Events</h3>
          <p>Tracking events will appear here as your shipment moves through the logistics network.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="tracking-timeline">
      {/* Filters */}
      <div className="timeline-filters">
        <button 
          className="filter-toggle"
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter size={16} />
          Filter Events
          <ChevronDown size={16} className={showFilters ? 'rotated' : ''} />
        </button>

        {showFilters && (
          <div className="filter-options">
            {filterOptions.map(option => (
              <button
                key={option.value}
                className={`filter-option ${filter === option.value ? 'active' : ''}`}
                onClick={() => {
                  setFilter(option.value);
                  setShowFilters(false);
                }}
              >
                {option.label}
                <span className="count">({option.count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="timeline-container">
        {sortedDates.length === 0 ? (
          <div className="no-results">
            <Info size={24} />
            <p>No events match the selected filter.</p>
          </div>
        ) : (
          sortedDates.map(date => (
            <div key={date} className="timeline-date-group">
              <div className="date-header">
                <h3>{new Date(date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}</h3>
                <span className="event-count">
                  {groupedEvents[date].length} event{groupedEvents[date].length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="timeline-events">
                {groupedEvents[date].map((event, index) => {
                  const EventIcon = getEventIcon(event);
                  const eventColor = getEventColor(event);
                  const { time } = formatDateTime(event.event_datetime);
                  const isLastEvent = index === groupedEvents[date].length - 1;

                  return (
                    <div key={event.event_id || index} className="timeline-event">
                      <div className="event-connector">
                        <div 
                          className="event-dot"
                          style={{ backgroundColor: eventColor }}
                        >
                          <EventIcon size={12} color="white" />
                        </div>
                        {!isLastEvent && <div className="connector-line" />}
                      </div>

                      <div className="event-content">
                        <div className="event-header">
                          <div className="event-time">
                            <Clock size={12} />
                            {time}
                          </div>
                          
                          <div className="event-badges">
                            {event.is_milestone && (
                              <span className="badge milestone">Milestone</span>
                            )}
                            {event.is_exception && (
                              <span className="badge exception">Exception</span>
                            )}
                            {event.is_critical && (
                              <span className="badge critical">Critical</span>
                            )}
                          </div>
                        </div>

                        <div className="event-description">
                          {event.event_description}
                        </div>

                        {event.event_location && (
                          <div className="event-location">
                            <MapPin size={12} />
                            {event.event_location}
                            {event.event_country && `, ${event.event_country}`}
                          </div>
                        )}

                        {event.milestone && (
                          <div className="milestone-info">
                            <strong>{event.milestone.milestone_name}</strong>
                            {event.milestone.milestone_category && (
                              <span className="milestone-category">
                                ({event.milestone.milestone_category})
                              </span>
                            )}
                          </div>
                        )}

                        {event.source && (
                          <div className="event-source">
                            Source: {event.source.source_name}
                          </div>
                        )}

                        {event.coordinates && (
                          <div className="event-coordinates">
                            <MapPin size={12} />
                            {event.coordinates.latitude.toFixed(4)}, {event.coordinates.longitude.toFixed(4)}
                          </div>
                        )}

                        {event.environmental_data && (
                          <div className="environmental-data">
                            {event.environmental_data.temperature_celsius && (
                              <span className="temp">
                                🌡️ {event.environmental_data.temperature_celsius}°C
                              </span>
                            )}
                            {event.environmental_data.humidity_percent && (
                              <span className="humidity">
                                💧 {event.environmental_data.humidity_percent}%
                              </span>
                            )}
                          </div>
                        )}

                        {event.additional_info && (
                          <details className="additional-info">
                            <summary>Additional Information</summary>
                            <pre>{JSON.stringify(event.additional_info, null, 2)}</pre>
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Summary */}
      <div className="timeline-summary">
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-value">{events.length}</span>
            <span className="stat-label">Total Events</span>
          </div>
          <div className="stat">
            <span className="stat-value">{events.filter(e => e.is_milestone).length}</span>
            <span className="stat-label">Milestones</span>
          </div>
          <div className="stat">
            <span className="stat-value">{events.filter(e => e.is_exception).length}</span>
            <span className="stat-label">Exceptions</span>
          </div>
          <div className="stat">
            <span className="stat-value">{new Set(events.map(e => e.event_location)).size}</span>
            <span className="stat-label">Locations</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackingTimeline;
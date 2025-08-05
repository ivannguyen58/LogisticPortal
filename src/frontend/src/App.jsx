import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { HelmetProvider } from 'react-helmet-async';

// Components
import TrackingSearch from './components/TrackingSearch';
import TrackingResult from './components/TrackingResult';
import Header from './components/Header';
import Footer from './components/Footer';

// Services
import realTimeTrackingService from './services/realTimeTrackingService';
import trackingService from './services/trackingService';

// Styles
import './App.css';

// Create a query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isRealTimeConnected, setIsRealTimeConnected] = useState(false);

  // Initialize real-time connection on app start
  useEffect(() => {
    initializeRealTimeConnection();
    
    return () => {
      realTimeTrackingService.disconnect();
    };
  }, []);

  /**
   * Initialize real-time WebSocket connection
   */
  const initializeRealTimeConnection = async () => {
    try {
      await realTimeTrackingService.connect();
      setIsRealTimeConnected(true);
      
      // Setup event handlers for real-time updates
      realTimeTrackingService.on('tracking:event', handleRealTimeUpdate);
      realTimeTrackingService.on('tracking:critical', handleCriticalUpdate);
      realTimeTrackingService.on('connection:lost', handleConnectionLost);
      realTimeTrackingService.on('connection:established', handleConnectionEstablished);
      
    } catch (error) {
      console.warn('Failed to establish real-time connection:', error.message);
      setIsRealTimeConnected(false);
    }
  };

  /**
   * Handle real-time tracking updates
   */
  const handleRealTimeUpdate = (data) => {
    console.log('Real-time tracking update:', data);
    
    // Update tracking data if it matches current shipment
    if (trackingData && data.shipmentId === trackingData.shipment?.shipment_id) {
      setTrackingData(prevData => ({
        ...prevData,
        latest_event: data.event,
        current_status: data.shipment.current_status,
        current_location: data.shipment.current_location,
        tracking_events: [data.event, ...(prevData.tracking_events || [])]
      }));
    }
  };

  /**
   * Handle critical tracking updates (show notifications)
   */
  const handleCriticalUpdate = (data) => {
    console.log('Critical tracking update:', data);
    
    // Show browser notification if available
    if (data.notification) {
      showNotification(data.notification);
    }
    
    // Update tracking data
    handleRealTimeUpdate(data);
  };

  /**
   * Handle connection lost
   */
  const handleConnectionLost = () => {
    console.warn('Real-time connection lost');
    setIsRealTimeConnected(false);
  };

  /**
   * Handle connection established
   */
  const handleConnectionEstablished = () => {
    console.log('Real-time connection established');
    setIsRealTimeConnected(true);
  };

  /**
   * Show browser notification
   */
  const showNotification = (notification) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.body,
        icon: '/favicon.ico',
        tag: 'tracking-update'
      });
    }
  };

  /**
   * Handle AWB search
   */
  const handleSearch = async (awbNumber) => {
    setLoading(true);
    setError(null);
    setTrackingData(null);

    try {
      console.log('Searching for AWB:', awbNumber);
      
      // Get tracking data from API
      const data = await trackingService.getTrackingByAwb(awbNumber, {
        include_history: true
      });
      
      setTrackingData(data);
      
      // Subscribe to real-time updates if connected
      if (isRealTimeConnected && data.shipment?.shipment_id) {
        try {
          realTimeTrackingService.subscribeToShipment(
            data.shipment.shipment_id,
            awbNumber
          );
        } catch (error) {
          console.warn('Failed to subscribe to real-time updates:', error.message);
        }
      }
      
    } catch (error) {
      console.error('Search failed:', error);
      setError(error.message || 'Failed to find shipment information');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handle notification subscription
   */
  const handleSubscribeNotifications = async (awbNumber) => {
    try {
      // This would typically require user authentication
      // For demo purposes, we'll just request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          console.log('Notification permission granted');
          // In a real app, you would save the subscription to the backend
        }
      }
    } catch (error) {
      console.error('Failed to subscribe to notifications:', error);
    }
  };

  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <Router>
          <div className="App">
            <Header isRealTimeConnected={isRealTimeConnected} />
            
            <main className="main-content">
              <Routes>
                <Route path="/" element={
                  <>
                    <TrackingSearch 
                      onSearch={handleSearch}
                      loading={loading}
                      error={error}
                    />
                    
                    {trackingData && (
                      <TrackingResult 
                        trackingData={trackingData}
                        loading={loading}
                        onSubscribeNotifications={handleSubscribeNotifications}
                      />
                    )}
                  </>
                } />
                
                <Route path="/track/:awbNumber" element={
                  <TrackingPage 
                    onSearch={handleSearch}
                    trackingData={trackingData}
                    loading={loading}
                    error={error}
                    onSubscribeNotifications={handleSubscribeNotifications}
                  />
                } />
              </Routes>
            </main>
            
            <Footer />
            
            {/* Toast notifications */}
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#363636',
                  color: '#fff',
                },
                success: {
                  duration: 3000,
                  iconTheme: {
                    primary: '#4ade80',
                    secondary: '#fff',
                  },
                },
                error: {
                  duration: 5000,
                  iconTheme: {
                    primary: '#ef4444',
                    secondary: '#fff',
                  },
                },
              }}
            />
          </div>
        </Router>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

/**
 * Tracking page component for direct AWB URL access
 */
const TrackingPage = ({ onSearch, trackingData, loading, error, onSubscribeNotifications }) => {
  const { awbNumber } = useParams();
  
  useEffect(() => {
    if (awbNumber && !trackingData && !loading) {
      onSearch(awbNumber);
    }
  }, [awbNumber, trackingData, loading, onSearch]);

  return (
    <>
      <TrackingSearch 
        onSearch={onSearch}
        loading={loading}
        error={error}
        initialValue={awbNumber}
      />
      
      {trackingData && (
        <TrackingResult 
          trackingData={trackingData}
          loading={loading}
          onSubscribeNotifications={onSubscribeNotifications}
        />
      )}
    </>
  );
};

export default App;
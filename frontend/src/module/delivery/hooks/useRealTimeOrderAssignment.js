import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { deliveryAPI } from '@/lib/api'

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000'

export const useRealTimeOrderAssignment = (deliveryPartnerId) => {
  const [currentAssignment, setCurrentAssignment] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [socket, setSocket] = useState(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5
  const reconnectTimeoutRef = useRef(null)

  const connectSocket = useCallback(() => {
    try {
      // Import socket.io-client dynamically
      import('socket.io-client').then(({ io }) => {
        const newSocket = io(`${SOCKET_URL}/delivery`, {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          reconnection: true,
          reconnectionAttempts: maxReconnectAttempts,
          reconnectionDelay: 1000,
        })

        newSocket.on('connect', () => {
          console.log('Connected to delivery assignment socket')
          setIsConnected(true)
          reconnectAttempts.current = 0
          
          // Join delivery partner room
          if (deliveryPartnerId) {
            newSocket.emit('join-delivery', deliveryPartnerId)
            console.log(`Joined delivery room for partner: ${deliveryPartnerId}`)
          }
        })

        newSocket.on('disconnect', (reason) => {
          console.log('Disconnected from delivery socket:', reason)
          setIsConnected(false)
          setCurrentAssignment(null)
        })

        newSocket.on('connect_error', (error) => {
          console.error('Socket connection error:', error)
          setIsConnected(false)
          
          // Handle reconnection logic
          if (reconnectAttempts.current < maxReconnectAttempts) {
            reconnectAttempts.current++
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000)
            
            reconnectTimeoutRef.current = setTimeout(() => {
              console.log(`Attempting to reconnect... (${reconnectAttempts.current}/${maxReconnectAttempts})`)
              connectSocket()
            }, delay)
          } else {
            console.error('Max reconnection attempts reached')
            toast.error('Connection lost. Please refresh the page.')
          }
        })

        // Listen for new order assignments
        newSocket.on('NEW_ORDER_ASSIGNMENT', (assignmentData) => {
          console.log('Received new order assignment:', assignmentData)
          
          // Validate assignment data
          if (!assignmentData || !assignmentData.orderId) {
            console.error('Invalid assignment data received:', assignmentData)
            return
          }

          // Play notification sound
          playNotificationSound()
          
          // Show toast notification
          toast.success('New order assigned! Accept within 60 seconds.', {
            duration: 5000,
            action: {
              label: 'View Order',
              onClick: () => {
                // The user can see the order in the assignment UI
              }
            }
          })

          // Set current assignment
          setCurrentAssignment(assignmentData)
        })

        // Listen for assignment cancellations (expired, rejected, reassigned)
        newSocket.on('ORDER_ASSIGNMENT_CANCELLED', (cancellationData) => {
          console.log('Order assignment cancelled:', cancellationData)
          
          if (cancellationData.orderId === currentAssignment?.orderId) {
            setCurrentAssignment(null)
            
            const message = cancellationData.message || 'Order assignment cancelled'
            toast.info(message, {
              duration: 3000
            })
          }
        })

        // Listen for orders accepted by other delivery partners
        newSocket.on('ORDER_ACCEPTED_BY_OTHER', (acceptanceData) => {
          console.log('Order accepted by another partner:', acceptanceData)
          
          if (acceptanceData.orderId === currentAssignment?.orderId) {
            setCurrentAssignment(null)
            
            toast.info('Order was accepted by another delivery partner', {
              duration: 3000
            })
          }
        })

        // Listen for countdown updates
        newSocket.on('ASSIGNMENT_COUNTDOWN', (countdownData) => {
          console.log('Countdown update:', countdownData)
          
          if (countdownData.orderId === currentAssignment?.orderId) {
            // Update countdown if needed
            if (countdownData.isExpiring) {
              toast.warning(`Order expires in ${countdownData.remainingSeconds} seconds!`, {
                duration: 2000
              })
            }
          }
        })

        // Listen for delivery room confirmation
        newSocket.on('delivery-room-joined', (data) => {
          console.log('Delivery room joined successfully:', data)
        })

        setSocket(newSocket)
      }).catch(error => {
        console.error('Failed to import socket.io-client:', error)
        toast.error('Failed to initialize real-time updates')
      })
    } catch (error) {
      console.error('Error connecting to socket:', error)
    }
  }, [deliveryPartnerId, currentAssignment?.orderId])

  const disconnectSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    
    if (socket) {
      socket.disconnect()
      setSocket(null)
    }
    setIsConnected(false)
    setCurrentAssignment(null)
  }, [socket])

  const clearCurrentAssignment = useCallback(() => {
    setCurrentAssignment(null)
  }, [])

  const playNotificationSound = useCallback(() => {
    try {
      // Create audio context and play sound
      const audio = new Audio('/audio/alert.mp3')
      audio.volume = 0.5
      audio.play().catch(error => {
        console.log('Could not play notification sound:', error)
      })
    } catch (error) {
      console.log('Could not play notification sound:', error)
    }
  }, [])

  // Handle connection
  useEffect(() => {
    if (deliveryPartnerId) {
      connectSocket()
    }

    return () => {
      disconnectSocket()
    }
  }, [deliveryPartnerId, connectSocket, disconnectSocket])

  // Re-join room if delivery partner ID changes
  useEffect(() => {
    if (socket && deliveryPartnerId && isConnected) {
      socket.emit('join-delivery', deliveryPartnerId)
    }
  }, [deliveryPartnerId, socket, isConnected])

  return {
    currentAssignment,
    isConnected,
    socket,
    clearCurrentAssignment,
    reconnect: connectSocket,
    disconnect: disconnectSocket
  }
}

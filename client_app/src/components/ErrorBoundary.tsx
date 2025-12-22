import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: any) {
        console.error('[ErrorBoundary] Caught error:', error);
        console.error('[ErrorBoundary] Error stack:', error.stack);
        console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <Text style={styles.title}>Error Caught!</Text>
                    <Text style={styles.error}>{this.state.error?.message}</Text>
                    <Text style={styles.stack}>{this.state.error?.stack}</Text>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#000',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#ff0040',
        marginBottom: 10,
    },
    error: {
        fontSize: 16,
        color: '#fff',
        marginBottom: 10,
    },
    stack: {
        fontSize: 12,
        color: '#888',
    },
});

export default ErrorBoundary;

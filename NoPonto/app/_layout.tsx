import { Stack } from 'expo-router';
import React from 'react';
import NavBar from '@/src/components/NavBar';
import '../global.css';

const _layout = () => {
  return (
    <>
      <Stack screenOptions={{headerShown: false}}>
          
          <Stack.Screen name="favoritos"/>

          <Stack.Screen name="index"/>

          <Stack.Screen name="linhas"/>

          <Stack.Screen name="configuracao"/>
            
      </Stack>

    <NavBar />
   </>

  );
}

export default _layout;

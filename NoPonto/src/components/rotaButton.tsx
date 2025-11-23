import { MapPin, MapPinPlus, PinIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable } from 'react-native';

export default function RotaButton() {

    function novaRota(){
        console.log("btn clicado");
    }

    return(
    <Pressable onPress={novaRota} className=' absolute right-8 bottom-36 bg-customYellow p-4 rounded-full'>
        <MapPinPlus color="#1E1E1E" size={32} />
    </Pressable>
    );

}
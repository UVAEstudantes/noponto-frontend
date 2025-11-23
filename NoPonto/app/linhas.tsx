import { Pressable, Text, View } from 'react-native'; 
import React, { useState } from 'react';
import MapView from 'react-native-maps';

const linhas = () => {

    /*
    
    tentar fazer um combo box personalizado q printa o modal select e muda a cor do pressable quando selecionado
    
    */

    const tipoModais = ["Ônibus", "BRT", "Trem", "Metrô" ];

    const [modal, setModal] = useState<String | null>(null);

    function clickModal(modalSelect: string){
        setModal(modalSelect);
        console.log("modal:", modalSelect);
    }


    return ( 

        <View className=" flex-1 justify-center items-center bg-white"> 
        
            <MapView 
                style={{ width: '100%', height: '100%', bottom: -30 }}

                mapType='standard' // tipo de mapa
                showsUserLocation= {true}
                followsUserLocation= {true}
                showsMyLocationButton= {false}

                customMapStyle={[ // remover os locais como lojas e coisas do tipo
                    {
                    featureType: "poi",
                    stylers: [{visibility: "off"}]
                    }
                ]}

                initialRegion={{
                    latitude: -22.512384145462976,
                    longitude: -43.22661972224441,
                    latitudeDelta: 0.2,
                    longitudeDelta: 0.2,
                }}
                        
            />

            <View className=" items-center rounded-3xl bg-white w-full h-full shadow-md bg-customGray">
                <Text className="mt-7 text-2xl font-semibold">Linhas e Hórarios</Text>
                
                <View className='mt-8 flex-row justify-around w-[350px] px-1 bg-customLightGray py-2 rounded-xl'>

                    <Pressable onPress={() => clickModal(tipoModais[0])} 
                    className={`${modal === tipoModais[0] ? 'bg-customYellow' : 'bg-customLightGray'} 
                    px-6 py-3 rounded-xl`}>
                        <Text >Ônibus</Text>
                    </Pressable>

                    <Pressable onPress={() => clickModal(tipoModais[1])} 
                    className={`${modal === tipoModais[1] ? 'bg-customYellow' : 'bg-customLightGray'} 
                    px-6 py-3 rounded-xl`}>
                        <Text >BRT</Text>
                    </Pressable>

                    <Pressable onPress={() => clickModal(tipoModais[2])} 
                    className={`${modal === tipoModais[2] ? 'bg-customYellow' : 'bg-customLightGray'} 
                    px-6 py-3 rounded-xl`}>
                        <Text >Trem</Text>
                    </Pressable>

                    <Pressable onPress={() => clickModal(tipoModais[3])} 
                    className={`${modal === tipoModais[3] ? 'bg-customYellow' : 'bg-customLightGray'} 
                    px-6 py-3 rounded-xl`}>
                        <Text >Metrô</Text>
                    </Pressable>

                </View>
            </View>

        </View> 
    )
}

export default linhas;
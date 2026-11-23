/**
 * Equipment photos from Wikimedia Commons (freely licensed; see CREDITS.md).
 * Resized to 480 px JPEG (~40 KB each) and served from /equipment/<id>.jpg.
 */
export interface PhotoCredit {
  author: string;
  license: string;
  source: string;
}

export const PHOTOS: Record<string, PhotoCredit> = {
  'bio-bsc-1': {
    author: 'The wub',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Biosafety_cabinet,_Science_Museum,_London.jpg',
  },
  'bio-cent-1': {
    author: 'Adoscam',
    license: 'CC BY-SA 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Centrifugeuse_m%C3%A9dicale_de_laboratoire_dans_un_centre_de_sant%C3%A9_au_B%C3%A9nin_03.jpg',
  },
  'bio-micro-1': {
    author: 'Masur',
    license: 'CC BY-SA 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Olympus-BX61-fluorescence_microscope.jpg',
  },
  'bio-pcr-1': {
    author: 'GFJ',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Eppendorf_Mastercycler_Pro_S.jpg',
  },
  'bio-spec-1': {
    author: 'Julia Ionov (Designer365)',
    license: 'CC BY-SA 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Microvolume_UV-Vis_spectrophotometry_-_Implen_NanoPhotometer_NP80.jpg',
  },
  'cse-fpga-1': {
    author: 'SparkFun Electronics from Boulder, USA',
    license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Mojo_v3_FPGA_Development_Board_(9303578174).jpg',
  },
  'cse-gpu-1': {
    author: 'FreeMediaKid!',
    license: 'CC BY-SA 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Nvidia_GeForce_RTX_5060_Ti_16GB,_PNY_Overclocked_Dual_Fan,_front.jpg',
  },
  'cse-gpu-2': {
    author: 'Nvidia',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Nvidia_Tesla_A100.png',
  },
  'cse-jetson-1': {
    author: 'SparkFun Electronics from Boulder, USA',
    license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:NVIDIA_Jetson_Nano_Developer_Kit_(40650425503).jpg',
  },
  'cse-jetson-2': {
    author: 'Auledas',
    license: 'CC BY 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:NVidia_Jetson_Orin_AGX.png',
  },
  'cse-pi-1': {
    author: 'Gareth Halfacree from Bradford, UK',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Circumference_C25_(41227579055).png',
  },
  'cse-robot-1': {
    author: 'Oleg Yunakov',
    license: 'CC BY-SA 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:KUKA_industrial_robotic_arm_performing_%22The_Beach%22_by_Roy_Nachum_-_06.jpg',
  },
  'cse-vr-1': {
    author: 'Maximilian Prandstätter',
    license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Oculus_Quest_II_(50844634326).jpg',
  },
  'ece-fg-1': {
    author: 'Anselm Schüler',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Function_Generator_FG100.jpg',
  },
  'ece-fpga-1': {
    author: 'Gareth Halfacree from Bradford, UK',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Adapteva_Parallella_DK02_-_Zynq_(15455173526).png',
  },
  'ece-iot-1': {
    author: 'Edwiyanto',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:ESP32_Dev_Board.jpg',
  },
  'ece-la-1': {
    author: 'DGtal',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Hewlett-Packard_1653B_Logic_analyzer.jpg',
  },
  'ece-osc-1': {
    author: 'Dave Jones from Australia',
    license: 'CC BY 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Keysight_3000T_Oscilloscope_Teardown_(16057072819).jpg',
  },
  'ece-osc-2': {
    author: 'Kalle',
    license: 'CC BY-SA 2.0',
    source: 'https://commons.wikimedia.org/wiki/File:Helsinki,_Oodi,_oscilloscope_(Rigol_DS1054).jpg',
  },
  'ece-psu-1': {
    author: 'Derrick Parker',
    license: 'CC0',
    source: 'https://commons.wikimedia.org/wiki/File:Bench_power_supply.jpg',
  },
  'ece-sa-1': {
    author: 'Giacomo Alessandroni',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Spectrum_analyzer_at_868.8_MHz.jpg',
  },
  'ece-solder-1': {
    author: 'Leisto',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Soldering_Station_375A%2B.jpg',
  },
  'ece-vna-1': {
    author: 'Dtwitkowski',
    license: 'CC BY-SA 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Anritsu_MS2035B_portable_vector_network_analyzer.jpg',
  },
  'mech-3dp-1': {
    author: 'Klaus-Dieter Keller',
    license: 'CC0',
    source: 'https://commons.wikimedia.org/wiki/File:Prusa_Mini%2B.jpg',
  },
  'mech-3dp-2': {
    author: 'User:Semenko',
    license: 'CC BY-SA 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Ultimaker_3D_Printer.jpg',
  },
  'mech-laser-1': {
    author: 'Henrysz',
    license: 'CC BY 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:CNC_Laser_Cutting_Head_in_Use_at_Martin_Guitar_Factory.jpg',
  },
  'mech-osc-1': {
    author: 'Biswarup Ganguly',
    license: 'CC BY 3.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Tektronix_TBS_1062_-_Two_Channel_Digital_Oscilloscope_-_Kolkata_2014-12-30_1416.JPG',
  },
  'mech-thermal-1': {
    author: 'Asurnipal',
    license: 'CC BY-SA 4.0',
    source:
      'https://commons.wikimedia.org/wiki/File:Flir_E8-Thermal_imaging_camera-Thermographic_camera-03ASD.jpg',
  },
  'mech-utm-1': {
    author: 'Ab1247',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Southwark-Emery_Universal_Testing_Machine.jpg',
  },
};

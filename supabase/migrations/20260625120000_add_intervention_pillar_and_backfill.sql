-- Persist the CMO pillar independently from the intervention domain.
alter table public.interventions
  add column if not exists intervention_pillar text
    constraint interventions_pillar_check
    check (intervention_pillar is null or intervention_pillar in ('capacidad', 'motivacion', 'oportunidad'));

-- Conservative deterministic backfill for existing rows that stored a pillar-like value in the domain field.
update public.interventions
set intervention_pillar = lower(trim(intervention_domain))
where intervention_pillar is null
  and lower(trim(intervention_domain)) in ('capacidad', 'motivacion', 'oportunidad');


-- Deterministic backfill for catalog interventions: exact intervention text uniquely identifies the CMO pillar.
update public.interventions as i
set intervention_pillar = catalog.cmo_pillar
from (values
  ('Revisar y validar el tratamiento cardiovascular para garantizar su adecuación, seguridad y efectividad dentro de los plazos de cumplimiento clínico sugeridos por las guías, registrando y comunicando las reacciones adversas a medicamentos observadas.' , 'oportunidad'),
  ('Monitorizar la adherencia del paciente a las prescripciones médicas y establecer estrategias efectivas de mejora mediante educación, apoyo conductual, atención colaborativa y gestión de casos, adaptadas a las características específicas de la enfermedad cardiovascular.' , 'motivacion'),
  ('Conciliar y revisar la medicación concomitante para identificar y gestionar posibles interacciones farmacológicas, ofreciendo alternativas terapéuticas cuando sea necesario.' , 'capacidad'),
  ('Promover un paciente activo e informado que comparta la responsabilidad sobre los resultados del tratamiento, proporcionando información básica sobre las terapias cardiovasculares y el manejo de problemas relacionados con la medicación.' , 'motivacion'),
  ('Proporcionar información detallada sobre los tratamientos y la enfermedad cardiovascular, resolviendo las dudas del paciente sobre su situación clínica.' , 'capacidad'),
  ('Ofrecer educación sanitaria general sobre estilos de vida cardiosaludables, control de factores de riesgo, uso correcto de la medicación y cumplimiento de objetivos terapéuticos mediante recursos web de farmacia o folletos para pacientes.' , 'capacidad'),
  ('Fomentar el uso de herramientas de autocuidado, proporcionando recursos web y aplicaciones informativas para la formación del paciente y la confirmación de cambios reales en el estilo de vida.' , 'capacidad'),
  ('Reforzar la educación sobre prevención y adherencia, destacando el impacto de la falta de adherencia sobre el aumento del riesgo cardiovascular.' , 'motivacion'),
  ('Control de la presión arterial.' , 'oportunidad'),
  ('Medición del perfil lipídico.' , 'oportunidad'),
  ('Cuantificación de HbA1c.' , 'oportunidad'),
  ('Monitorización de glucosa' , 'oportunidad'),
  ('Cribado de fibrilación auricular en pacientes mayores de 65 años.' , 'oportunidad'),
  ('Identificar la etapa de cambio del paciente —precontemplación, contemplación, preparación, acción o mantenimiento— utilizando el modelo transteórico.' , 'motivacion'),
  ('Aplicar técnicas de entrevista motivacional para aumentar la implicación del paciente y resolver la ambivalencia hacia el abandono del tabaco.' , 'motivacion'),
  ('Entregar materiales educativos básicos sobre los riesgos del tabaco y de los nuevos sistemas de administración de nicotina.' , 'capacidad'),
  ('Evaluar de forma rutinaria la adherencia mediante herramientas validadas, como el cuestionario Morisky-Green-Levine, combinándolo con la validación de los registros de dispensación mediante sistemas electrónicos.' , 'oportunidad'),
  ('Proporcionar información básica sobre la relación crítica entre adherencia terapéutica y prevención de eventos cardiovasculares secundarios.' , 'capacidad'),
  ('Monitorizar y tomar decisiones basadas en resultados comunicados por el paciente y medidas de experiencia del paciente utilizadas para el seguimiento.' , 'oportunidad'),
  ('Mantener contacto adicional con el paciente entre visitas programadas mediante teleasistencia y para la planificación de futuras citas.' , 'oportunidad'),
  ('Desarrollar materiales adaptados para cada paciente y cuidador, como horarios de medicación, diarios del paciente u otros recursos personalizados.' , 'capacidad'),
  ('Proporcionar servicios de monitorización ambulatoria de presión arterial o automedida domiciliaria de la presión arterial.' , 'oportunidad'),
  ('Diseñar y entregar guías personalizadas de cesación tabáquica y diarios del paciente para registrar desencadenantes y progresos.' , 'capacidad'),
  ('Implicar a familiares o cuidadores en el plan de abandono del tabaco para favorecer un entorno de apoyo.' , 'oportunidad'),
  ('Establecer comunicación bidireccional con el médico de atención primaria para homogeneizar objetivos.' , 'oportunidad'),
  ('Abordar determinantes sociales de la salud cuando se detecten desigualdades sociales.' , 'oportunidad'),
  ('Realizar entrevistas clínicas para identificar barreras específicas a la adherencia, como polifarmacia, efectos adversos o pautas de administración complejas.' , 'motivacion'),
  ('Proporcionar calendarios de medicación y registros personalizados para simplificar la rutina de administración y reducir olvidos.' , 'capacidad'),
  ('Programar seguimientos telefónicos o recordatorios automatizados para reforzar la adherencia y monitorizar la estabilidad terapéutica entre visitas presenciales.' , 'oportunidad'),
  ('Implicar al paciente en el plan farmacoterapéutico compartiendo el progreso hacia sus objetivos clínicos y estableciendo acciones acordadas.' , 'motivacion'),
  ('Desarrollar programas estructurados para la detección, prevención y manejo de factores de riesgo específicos, como hipertensión, dislipemia o diabetes, utilizando herramientas de telemedicina.' , 'oportunidad'),
  ('Diseñar y proporcionar recursos personalizados para pacientes y cuidadores, incluidos calendarios de medicación y registros del paciente.' , 'capacidad'),
  ('Proporcionar consejo firme, personalizado y no enjuiciador sobre los beneficios de abandonar el tabaco, enfatizando su impacto en la reducción de eventos cardiovasculares.' , 'motivacion'),
  ('Implicar al paciente en un plan estructurado de cesación, incluyendo la revisión y validación de tratamientos farmacológicos como terapia sustitutiva con nicotina, vareniclina o bupropión, para garantizar adecuación y seguridad.' , 'oportunidad'),
  ('Utilizar tecnologías de la información y herramientas de telemedicina para monitorizar en tiempo real síntomas de abstinencia y proporcionar apoyo inmediato en situaciones de alto riesgo de recaída.' , 'oportunidad'),
  ('Establecer canales de comunicación rápida con el médico de atención primaria para comunicar reacciones adversas o ajustar el tratamiento según la evolución del paciente.' , 'oportunidad'),
  ('Planificar visitas intensivas de seguimiento cada 2-3 meses y contactos suplementarios por teleasistencia para consolidar la fase de mantenimiento.' , 'oportunidad'),
  ('Establecer canales de comunicación rápida con el equipo asistencial para abordar reacciones adversas a medicamentos.' , 'oportunidad'),
  ('Desarrollar planes de actuación asistencial interniveles para transiciones clínicas complejas.' , 'oportunidad'),
  ('Implementar sistemas personalizados de dosificación para organizar regímenes farmacoterapéuticos complejos, minimizar errores de medicación y mejorar la seguridad en pacientes con alta polimedicación.' , 'oportunidad')
) as catalog(intervention_type, cmo_pillar)
where i.intervention_pillar is null
  and i.intervention_type = catalog.intervention_type;
